package com.notesindia.storage;

import com.notesindia.common.ApiException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.*;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.URI;

@Service
@ConditionalOnProperty(name = "notesindia.storage.provider", havingValue = "s3")
public class S3StorageService implements StorageService {

    private static final Logger log = LoggerFactory.getLogger(S3StorageService.class);

    private final S3Client s3Client;
    private final String bucket;

    public S3StorageService(
            @Value("${notesindia.storage.s3.endpoint}") String endpoint,
            @Value("${notesindia.storage.s3.region:us-east-1}") String region,
            @Value("${notesindia.storage.s3.bucket}") String bucket,
            @Value("${notesindia.storage.s3.access-key}") String accessKey,
            @Value("${notesindia.storage.s3.secret-key}") String secretKey,
            @Value("${notesindia.storage.s3.path-style-access:true}") boolean pathStyleAccess
    ) {
        this.bucket = bucket;
        this.s3Client = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(pathStyleAccess).build())
                .build();
        ensureBucketExists();
    }

    private void ensureBucketExists() {
        try {
            s3Client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
        } catch (NoSuchBucketException e) {
            try {
                s3Client.createBucket(CreateBucketRequest.builder().bucket(bucket).build());
                log.info("Created S3 bucket: {}", bucket);
            } catch (Exception ex) {
                log.warn("Could not auto-create S3 bucket {}: {}", bucket, ex.getMessage());
            }
        } catch (Exception ex) {
            log.warn("S3 bucket check skipped/failed ({}): {}", bucket, ex.getMessage());
        }
    }

    @Override
    public void store(String storageKey, byte[] content, String contentType) {
        PutObjectRequest request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(storageKey)
                .contentType(contentType)
                .build();
        s3Client.putObject(request, RequestBody.fromBytes(content));
    }

    @Override
    public InputStream retrieve(String storageKey) {
        return new ByteArrayInputStream(retrieveBytes(storageKey));
    }

    @Override
    public byte[] retrieveBytes(String storageKey) {
        try {
            GetObjectRequest request = GetObjectRequest.builder()
                    .bucket(bucket)
                    .key(storageKey)
                    .build();
            ResponseBytes<GetObjectResponse> response = s3Client.getObjectAsBytes(request);
            return response.asByteArray();
        } catch (NoSuchKeyException e) {
            throw ApiException.notFound("File not found in object storage");
        }
    }

    @Override
    public void delete(String storageKey) {
        try {
            s3Client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(storageKey).build());
        } catch (Exception ex) {
            log.warn("Failed to delete object {}: {}", storageKey, ex.getMessage());
        }
    }

    @Override
    public boolean exists(String storageKey) {
        try {
            s3Client.headObject(HeadObjectRequest.builder().bucket(bucket).key(storageKey).build());
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
