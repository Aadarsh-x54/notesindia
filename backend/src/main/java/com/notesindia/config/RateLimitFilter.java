package com.notesindia.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Component
public class RateLimitFilter extends OncePerRequestFilter {

    private final int apiLimitPerMinute;
    private final int aiLimitPerMinute;
    private final int uploadLimitPerMinute;
    private final Map<String, WindowCounter> buckets = new ConcurrentHashMap<>();

    public RateLimitFilter(
            @Value("${notesindia.rate-limit.api-requests-per-minute:120}") int apiLimitPerMinute,
            @Value("${notesindia.rate-limit.ai-requests-per-minute:25}") int aiLimitPerMinute,
            @Value("${notesindia.rate-limit.upload-requests-per-minute:15}") int uploadLimitPerMinute
    ) {
        this.apiLimitPerMinute = apiLimitPerMinute;
        this.aiLimitPerMinute = aiLimitPerMinute;
        this.uploadLimitPerMinute = uploadLimitPerMinute;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        String path = request.getRequestURI();
        if (!path.startsWith("/api/") || "OPTIONS".equalsIgnoreCase(request.getMethod())) {
            filterChain.doFilter(request, response);
            return;
        }

        String clientKey = extractClientIp(request);
        String bucketType = "api";
        int limit = apiLimitPerMinute;

        if (path.startsWith("/api/ai/") && "POST".equalsIgnoreCase(request.getMethod())) {
            bucketType = "ai";
            limit = aiLimitPerMinute;
        } else if ("/api/notes".equals(path) && "POST".equalsIgnoreCase(request.getMethod())) {
            bucketType = "upload";
            limit = uploadLimitPerMinute;
        }

        String key = bucketType + ":" + clientKey;
        long currentMinute = Instant.now().getEpochSecond() / 60;

        WindowCounter counter = buckets.compute(key, (k, existing) -> {
            if (existing == null || existing.minuteEpoch != currentMinute) {
                return new WindowCounter(currentMinute, new AtomicInteger(1));
            }
            existing.count.incrementAndGet();
            return existing;
        });

        int used = counter.count.get();
        int remaining = Math.max(0, limit - used);
        response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));

        if (used > limit) {
            response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    "{\"success\":false,\"message\":\"Rate limit exceeded for " + bucketType + " requests. Please try again in a minute.\"}"
            );
            return;
        }

        filterChain.doFilter(request, response);
    }

    private String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private record WindowCounter(long minuteEpoch, AtomicInteger count) {}
}
