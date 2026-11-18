package com.notesindia.storage;

import com.notesindia.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Component
public class FileValidator {

    private static final Map<String, String> ALLOWED_FORMATS = Map.of(
            "pdf", "application/pdf",
            "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "doc", "application/msword",
            "pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "ppt", "application/vnd.ms-powerpoint",
            "txt", "text/plain",
            "md", "text/markdown"
    );

    private static final Set<String> ALLOWED_MIME_TYPES = Set.of(
            "application/pdf",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.ms-powerpoint",
            "text/plain",
            "text/markdown",
            "application/octet-stream"
    );

    private final long maxFileSizeBytes;
    private final MalwareScanner malwareScanner;

    public FileValidator(
            @Value("${notesindia.storage.max-file-size-bytes:52428800}") long maxFileSizeBytes,
            MalwareScanner malwareScanner
    ) {
        this.maxFileSizeBytes = maxFileSizeBytes;
        this.malwareScanner = malwareScanner;
    }

    public ValidatedFile validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw ApiException.badRequest("Please attach a non-empty educational note file");
        }
        if (file.getSize() > maxFileSizeBytes) {
            throw ApiException.badRequest("File exceeds maximum allowed size of " + (maxFileSizeBytes / (1024 * 1024)) + " MB");
        }

        String originalFilename = sanitizeFilename(file.getOriginalFilename());
        String ext = extractExtension(originalFilename);
        if (!ALLOWED_FORMATS.containsKey(ext)) {
            throw ApiException.badRequest("Unsupported file format '." + ext + "'. Supported formats: PDF, DOCX, DOC, PPTX, PPT, TXT, MD");
        }

        String contentType = file.getContentType();
        if (contentType != null && !contentType.isBlank()) {
            String baseType = contentType.split(";")[0].trim().toLowerCase(Locale.ROOT);
            if (!ALLOWED_MIME_TYPES.contains(baseType)) {
                throw ApiException.badRequest("Disallowed MIME type: " + baseType);
            }
        }

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw ApiException.badRequest("Failed to read uploaded file");
        }

        verifyMagicBytes(ext, bytes);
        malwareScanner.scan(originalFilename, bytes);

        String canonicalMime = ALLOWED_FORMATS.get(ext);
        String checksum = sha256(bytes);

        return new ValidatedFile(
                originalFilename,
                ext.toUpperCase(Locale.ROOT),
                canonicalMime,
                bytes.length,
                checksum,
                bytes
        );
    }

    private void verifyMagicBytes(String ext, byte[] bytes) {
        if ("pdf".equals(ext)) {
            if (bytes.length < 4 || bytes[0] != '%' || bytes[1] != 'P' || bytes[2] != 'D' || bytes[3] != 'F') {
                throw ApiException.badRequest("File does not have a valid PDF signature");
            }
        } else if ("docx".equals(ext) || "pptx".equals(ext)) {
            // OOXML files are ZIP archives starting with PK\x03\x04
            if (bytes.length < 4 || bytes[0] != 0x50 || bytes[1] != 0x4B) {
                throw ApiException.badRequest("File does not have a valid Office Open XML signature");
            }
        }
    }

    private String sanitizeFilename(String raw) {
        if (raw == null || raw.isBlank()) return "note.pdf";
        String name = raw.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        name = name.replaceAll("[^a-zA-Z0-9._\\- ]", "_").trim();
        return name.isEmpty() ? "note.pdf" : name;
    }

    private String extractExtension(String filename) {
        int dot = filename.lastIndexOf('.');
        if (dot < 0 || dot == filename.length() - 1) {
            throw ApiException.badRequest("Uploaded file must have a valid extension");
        }
        return filename.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    public static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public record ValidatedFile(
            String originalFilename,
            String fileFormat,
            String mimeType,
            long sizeBytes,
            String checksum,
            byte[] bytes
    ) {}
}
