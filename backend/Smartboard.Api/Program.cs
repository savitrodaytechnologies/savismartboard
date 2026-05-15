using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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

// Logging
builder.Host.UseSerilog((ctx, lc) => lc
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

// Options
builder.Services.Configure<SavischoolsOptions>(builder.Configuration.GetSection("Savischools"));
builder.Services.Configure<KBotOptions>(builder.Configuration.GetSection("KBot"));
builder.Services.Configure<AiOptions>(builder.Configuration.GetSection("Ai"));

// Infra
builder.Services.AddSingleton<ISqlConnectionFactory, SqlConnectionFactory>();
builder.Services.AddHttpContextAccessor();

// Auth — dev: local symmetric key (no Savischools needed); prod: Savischools JWKS authority
if (builder.Environment.IsDevelopment())
{
    var devKey = new SymmetricSecurityKey(
        Encoding.UTF8.GetBytes(builder.Configuration["DevJwt:Key"]
            ?? throw new InvalidOperationException("DevJwt:Key missing from appsettings.Development.json")));
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = false,
                ValidateAudience         = false,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                IssuerSigningKey         = devKey,
                ClockSkew                = TimeSpan.FromMinutes(5)
            };
        });
}
else
{
    var jwt = builder.Configuration.GetSection("Savischools:Jwt");
    builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority             = jwt["Authority"];
            options.Audience              = jwt["Audience"];
            options.RequireHttpsMetadata  = true;
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidateAudience         = true,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                ClockSkew                = TimeSpan.FromMinutes(2)
            };
        });
}
builder.Services.AddAuthorization();
builder.Services.AddScoped<ITeacherContextAccessor, TeacherContextAccessor>();

// HTTP clients with Polly retry
builder.Services.AddHttpClient<ISavischoolsClient, SavischoolsClient>()
    .AddPolicyHandler(HttpPolicies.Retry());
builder.Services.AddHttpClient<IKBotClient, KBotClient>()
    .AddPolicyHandler(HttpPolicies.Retry());
builder.Services.AddHttpClient<IAiClient, AiClient>()
    .AddPolicyHandler(HttpPolicies.Retry());

// Domain services — dev uses local mocks so Parivesh can work without Savischools or KBot
if (builder.Environment.IsDevelopment())
{
    builder.Services.AddScoped<ISmartboardContextService, DevSmartboardContextService>();
    builder.Services.AddScoped<IKBotContentService, DevKBotContentService>();
    builder.Services.AddScoped<IKBotQuestionService, DevKBotQuestionService>();
}
else
{
    builder.Services.AddScoped<ISmartboardContextService, SmartboardContextService>();
    builder.Services.AddScoped<IKBotContentService, KBotContentService>();
    builder.Services.AddScoped<IKBotQuestionService, KBotQuestionService>();
}
builder.Services.AddScoped<ISmartboardSessionService, SmartboardSessionService>();
builder.Services.AddScoped<ISmartboardAiService, SmartboardAiService>();

// Repositories
builder.Services.AddScoped<ISmartboardSessionRepository, SmartboardSessionRepository>();
builder.Services.AddScoped<ISmartboardUsageLogRepository, SmartboardUsageLogRepository>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "Savismartboard API", Version = "v1" });
    // Adds a Bearer token input box in Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name         = "Authorization",
        Type         = SecuritySchemeType.Http,
        Scheme       = "bearer",
        BearerFormat = "JWT",
        In           = ParameterLocation.Header,
        Description  = "Dev: GET /api/dev/token → copy token → paste here (without 'Bearer ' prefix)."
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme { Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" } },
            Array.Empty<string>()
        }
    });
});

// CORS for the React dev server
builder.Services.AddCors(o => o.AddPolicy("frontend", p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:5173" })
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
app.UseStaticFiles();          // serves frontend/dist copied to wwwroot (Docker or published build)
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/healthz");
app.MapHealthChecks("/readyz");

app.Run();
