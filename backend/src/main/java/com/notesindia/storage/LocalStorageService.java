package com.notesindia.storage;

import com.notesindia.common.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;

@Service
@ConditionalOnProperty(name = "notesindia.storage.provider", havingValue = "local", matchIfMissing = true)
public class LocalStorageService implements StorageService {

    private final Path rootDir;

    public LocalStorageService(@Value("${notesindia.storage.local-dir:./storage/uploads}") String localDir) {
        this.rootDir = Paths.get(localDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.rootDir);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to initialize local storage directory: " + this.rootDir, e);
        }
    }

    @Override
    public void store(String storageKey, byte[] content, String contentType) {
        Path target = resolveSafe(storageKey);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, content, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to write file to local storage", e);
        }
    }

    @Override
    public InputStream retrieve(String storageKey) {
        Path target = resolveSafe(storageKey);
        if (!Files.exists(target)) {
            throw ApiException.notFound("File not found in storage");
        }
        try {
            return Files.newInputStream(target);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to open stored file", e);
        }
    }

    @Override
    public byte[] retrieveBytes(String storageKey) {
        Path target = resolveSafe(storageKey);
        if (!Files.exists(target)) {
            throw ApiException.notFound("File not found in storage");
        }
        try {
            return Files.readAllBytes(target);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to read stored file", e);
        }
    }

    @Override
    public void delete(String storageKey) {
        Path target = resolveSafe(storageKey);
        try {
            Files.deleteIfExists(target);
        } catch (IOException ignored) {
        }
    }

    @Override
    public boolean exists(String storageKey) {
        return Files.exists(resolveSafe(storageKey));
    }

    private Path resolveSafe(String storageKey) {
        Path resolved = rootDir.resolve(storageKey).normalize();
        if (!resolved.startsWith(rootDir)) {
            throw ApiException.badRequest("Invalid storage key");
        }
        return resolved;
    }
}
