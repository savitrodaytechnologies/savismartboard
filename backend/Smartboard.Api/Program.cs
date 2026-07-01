using System.Text;
using Amazon;
using Amazon.S3;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Smartboard.Api.Auth;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Infrastructure;
using Smartboard.Api.Repositories;
using Smartboard.Api.Services;
using Smartboard.Api.Services.Dev;

var builder = WebApplication.CreateBuilder(args);

// Load local overrides (gitignored) — put your API keys here instead of appsettings.Development.json
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: false);

// Logging
builder.Host.UseSerilog((ctx, lc) => lc
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

// Options
builder.Services.Configure<SavischoolsOptions>(builder.Configuration.GetSection("Savischools"));
builder.Services.Configure<KBotOptions>(builder.Configuration.GetSection("KBot"));
builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("Ai"));
builder.Services.Configure<S3Options>(builder.Configuration.GetSection("S3"));

// Infra
builder.Services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddSingleton<ISaviLmsConnectionFactory, SaviLmsConnectionFactory>();
builder.Services.AddSingleton<ISaviKnowledgeBotConnectionFactory, SaviKnowledgeBotConnectionFactory>();
builder.Services.AddSingleton<IAmazonS3>(sp =>
{
    var opts = sp.GetRequiredService<IOptions<S3Options>>().Value;
    var region = RegionEndpoint.GetBySystemName(opts.Region);
    return new AmazonS3Client(region); // Uses EC2 IAM role credentials automatically
});
builder.Services.AddSingleton<IS3PageArchiveService, S3PageArchiveService>();
builder.Services.AddHttpContextAccessor();

// Auth — dev: local symmetric key (no Savischools needed); prod: Savischools JWKS authority
var authBuilder = builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme);

if (builder.Environment.IsDevelopment())
{
    var devKey = new SymmetricSecurityKey(
        Encoding.UTF8.GetBytes(builder.Configuration["DevJwt:Key"]
            ?? throw new InvalidOperationException("DevJwt:Key missing from appsettings.Development.json")));
    authBuilder.AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false,
            ValidateAudience = false,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = devKey,
            ClockSkew = TimeSpan.FromMinutes(5)
        };
    });
}
else
{
    var jwt = builder.Configuration.GetSection("Savischools:Jwt");
    authBuilder.AddJwtBearer(options =>
    {
        options.Authority = jwt["Authority"];
        options.Audience = jwt["Audience"];
        options.RequireHttpsMetadata = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });
}

// Add LmsJwt for the SDK
var lmsKeyString = builder.Configuration["LmsJwt:Key"] ?? "savischools-lms-sdk-secret-key-32-chars!!";
var lmsKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(lmsKeyString));
authBuilder.AddJwtBearer("LmsJwt", options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = "SaviLMS",
        ValidateAudience = true,
        ValidAudience = "SaviLMS_SDK",
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = lmsKey,
        ClockSkew = TimeSpan.Zero
    };
});

builder.Services.AddAuthorization();
builder.Services.AddScoped<ITeacherContextAccessor, TeacherContextAccessor>();

// HTTP clients with Polly retry
// Savischools: 5s timeout so a down service fails fast (not 100s)
builder.Services.AddHttpClient<ISavischoolsClient, SavischoolsClient>(c => c.Timeout = TimeSpan.FromSeconds(5))
    .AddPolicyHandler(HttpPolicies.Retry());
builder.Services.AddHttpClient<IKBotClient, KBotClient>()
    .AddPolicyHandler(HttpPolicies.Retry());

// Register named HttpClient "ai" (Polly retry) used by HybridAiClient
builder.Services.AddHttpClient("ai").AddPolicyHandler(HttpPolicies.Retry());
// HybridAiClient: DeepSeek for text-only, Anthropic (copilot) for vision — routes per call
builder.Services.AddSingleton<IAiClient, HybridAiClient>();

// Domain services — dev uses SmartboardContextService (real Savischools). KBot can use mocks or real client.
builder.Services.AddScoped<ISmartboardContextService, SmartboardContextService>();

bool useKBotMock = builder.Environment.IsDevelopment() && (builder.Configuration.GetValue<bool?>("KBot:UseMock") ?? true);
if (useKBotMock)
{
    builder.Services.AddScoped<IKBotContentService, DevKBotContentService>();
    builder.Services.AddScoped<IKBotQuestionService, DevKBotQuestionService>();
    builder.Services.AddScoped<IKBotCurriculumService, DevKBotCurriculumService>();
}
else
{
    builder.Services.AddScoped<IKBotContentService, KBotContentService>();
    builder.Services.AddScoped<IKBotQuestionService, KBotQuestionService>();
    builder.Services.AddScoped<IKBotCurriculumService, KBotCurriculumService>();
}
builder.Services.AddScoped<ISmartboardSessionService, SmartboardSessionService>();
builder.Services.AddScoped<ISmartboardAiService, SmartboardAiService>();
builder.Services.AddScoped<ISaviLmsService, SaviLmsService>();

// Repositories
builder.Services.AddScoped<ISmartboardSessionRepository, SmartboardSessionRepository>();
builder.Services.AddScoped<ISmartboardUsageLogRepository, SmartboardUsageLogRepository>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Savismartboard API", Version = "v1" });
    // Use full type names (replace '+' for nested types) to avoid schema id collisions
    c.CustomSchemaIds(type => (type.FullName ?? type.Name).Replace('+', '.'));
    // Adds a Bearer token input box in Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Dev: GET /api/dev/token → copy token → paste here (without 'Bearer ' prefix)."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// CORS for frontend and external project integrations
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(allowedOrigins)
    .AllowAnyHeader()
    .AllowAnyMethod()));

builder.Services.AddHealthChecks();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseSerilogRequestLogging();
app.UseDefaultFiles();         // serves index.html for / and unknown paths (SPA fallback)
app.UseStaticFiles();          // serves frontend/dist copied to wwwroot (Docker or published build)
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/healthz");
app.MapHealthChecks("/readyz");

// SPA fallback — serve index.html for all unmatched routes so React Router works
app.MapFallbackToFile("index.html");

app.Run();
