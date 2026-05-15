# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: Build frontend
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /src
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # → /src/dist

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: Publish backend
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS backend-build
WORKDIR /src
COPY backend/ ./
RUN dotnet restore Savismartboard.sln
RUN dotnet publish Smartboard.Api/Smartboard.Api.csproj \
    -c Release -r linux-x64 --self-contained false \
    -o /publish/api

# Copy frontend dist into wwwroot so UseStaticFiles serves it
COPY --from=frontend-build /src/dist /publish/api/wwwroot

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: Runtime image
# ─────────────────────────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend-build /publish/api .

# Non-root user
RUN addgroup --system smartboard && adduser --system --ingroup smartboard smartboard
USER smartboard

ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5000/healthz || exit 1

ENTRYPOINT ["dotnet", "Smartboard.Api.dll"]
