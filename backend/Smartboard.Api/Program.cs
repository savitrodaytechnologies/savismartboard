using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Serilog;
using Smartboard.Api.Auth;
using Smartboard.Api.HttpClients;
using Smartboard.Api.Infrastructure;
using Smartboard.Api.Repositories;
using Smartboard.Api.Services;

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

// Auth — validates Savischools-issued JWT
var jwt = builder.Configuration.GetSection("Savischools:Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = jwt["Authority"];
        options.Audience = jwt["Audience"];
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ClockSkew = TimeSpan.FromMinutes(2)
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddScoped<ITeacherContextAccessor, TeacherContextAccessor>();

// HTTP clients with Polly retry
builder.Services.AddHttpClient<ISavischoolsClient, SavischoolsClient>()
    .AddPolicyHandler(HttpPolicies.Retry());
builder.Services.AddHttpClient<IKBotClient, KBotClient>()
    .AddPolicyHandler(HttpPolicies.Retry());
builder.Services.AddHttpClient<IAiClient, AiClient>()
    .AddPolicyHandler(HttpPolicies.Retry());

// Domain services
builder.Services.AddScoped<ISmartboardContextService, SmartboardContextService>();
builder.Services.AddScoped<IKBotContentService, KBotContentService>();
builder.Services.AddScoped<IKBotQuestionService, KBotQuestionService>();
builder.Services.AddScoped<ISmartboardSessionService, SmartboardSessionService>();
builder.Services.AddScoped<ISmartboardAiService, SmartboardAiService>();

// Repositories
builder.Services.AddScoped<ISmartboardSessionRepository, SmartboardSessionRepository>();
builder.Services.AddScoped<ISmartboardUsageLogRepository, SmartboardUsageLogRepository>();

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
app.MapHealthChecks("/healthz");
app.MapHealthChecks("/readyz");

app.Run();
