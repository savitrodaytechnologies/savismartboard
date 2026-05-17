using System.IO.Compression;
using System.Text;
using Amazon.S3;
using Amazon.S3.Model;
using Microsoft.Extensions.Options;
using Smartboard.Api.Infrastructure;

namespace Smartboard.Api.Infrastructure;

public interface IS3PageArchiveService
{
    /// <summary>
    /// Gzip-compresses <paramref name="json"/> and uploads it to S3.
    /// Returns the S3 object key (stored in <c>PageJsonUrl</c> column).
    /// </summary>
    Task<string> ArchivePageAsync(long sessionId, int pageNo, string json, CancellationToken ct = default);

    /// <summary>
    /// Downloads and decompresses the page JSON blob identified by <paramref name="s3Key"/>.
    /// </summary>
    Task<string> RestorePageAsync(string s3Key, CancellationToken ct = default);
}

public sealed class S3PageArchiveService : IS3PageArchiveService
{
    private readonly IAmazonS3 _s3;
    private readonly string _bucket;
    private readonly ILogger<S3PageArchiveService> _log;

    public S3PageArchiveService(IAmazonS3 s3, IOptions<S3Options> opts, ILogger<S3PageArchiveService> log)
    {
        _s3 = s3;
        _bucket = opts.Value.BucketName;
        _log = log;
    }

    public async Task<string> ArchivePageAsync(long sessionId, int pageNo, string json, CancellationToken ct = default)
    {
        var key = $"sessions/{sessionId}/page-{pageNo}.json";

        // Gzip the JSON in-memory
        using var compressed = new MemoryStream();
        await using (var gz = new GZipStream(compressed, CompressionLevel.Optimal, leaveOpen: true))
        {
            var bytes = Encoding.UTF8.GetBytes(json);
            await gz.WriteAsync(bytes, ct);
        }
        compressed.Position = 0;

        var request = new PutObjectRequest
        {
            BucketName = _bucket,
            Key = key,
            InputStream = compressed,
            ContentType = "application/json",
            AutoCloseStream = false,
        };
        request.Headers.ContentEncoding = "gzip";

        await _s3.PutObjectAsync(request, ct);
        _log.LogDebug("Archived session {SessionId} page {PageNo} → s3://{Bucket}/{Key} ({Bytes} bytes compressed)",
            sessionId, pageNo, _bucket, key, compressed.Length);

        return key;
    }

    public async Task<string> RestorePageAsync(string s3Key, CancellationToken ct = default)
    {
        var response = await _s3.GetObjectAsync(_bucket, s3Key, ct);
        await using var gz = new GZipStream(response.ResponseStream, CompressionMode.Decompress);
        using var reader = new StreamReader(gz, Encoding.UTF8);
        return await reader.ReadToEndAsync(ct);
    }
}
