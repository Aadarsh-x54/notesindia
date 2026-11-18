package com.notesindia.storage;

import java.io.InputStream;

public interface StorageService {
    void store(String storageKey, byte[] content, String contentType);
    InputStream retrieve(String storageKey);
    byte[] retrieveBytes(String storageKey);
    void delete(String storageKey);
    boolean exists(String storageKey);
}
