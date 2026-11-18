package com.notesindia.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.UUID;

public final class AuthDtos {

    private AuthDtos() {}

    public record RegisterRequest(
            @NotBlank @Size(min = 3, max = 50)
            @Pattern(regexp = "^[a-zA-Z0-9_.-]+$", message = "Username may only contain letters, digits, underscores, dots, and hyphens")
            String username,
            @NotBlank @Email @Size(max = 255) String email,
            @NotBlank @Size(min = 8, max = 100) String password,
            @NotBlank @Size(min = 2, max = 120) String fullName,
            @Size(max = 200) String institution
    ) {}

    public record LoginRequest(
            @NotBlank String identifier, // username or email
            @NotBlank String password
    ) {}

    public record RefreshRequest(
            @NotBlank String refreshToken
    ) {}

    public record ForgotPasswordRequest(
            @NotBlank @Email String email
    ) {}

    public record ResetPasswordRequest(
            @NotBlank String token,
            @NotBlank @Size(min = 8, max = 100) String newPassword
    ) {}

    public record UpdateProfileRequest(
            @NotBlank @Size(min = 2, max = 120) String fullName,
            @Size(max = 1000) String bio,
            @Size(max = 200) String institution
    ) {}

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 100) String newPassword
    ) {}

    public record UserResponse(
            UUID id,
            String username,
            String email,
            String fullName,
            String bio,
            String institution,
            Role role,
            boolean active,
            Instant createdAt
    ) {
        public static UserResponse from(User u) {
            return new UserResponse(
                    u.getId(), u.getUsername(), u.getEmail(), u.getFullName(),
                    u.getBio(), u.getInstitution(), u.getRole(), u.isActive(), u.getCreatedAt()
            );
        }
    }

    public record PublicUserResponse(
            UUID id,
            String username,
            String fullName,
            String bio,
            String institution,
            Role role,
            Instant createdAt
    ) {
        public static PublicUserResponse from(User u) {
            return new PublicUserResponse(
                    u.getId(), u.getUsername(), u.getFullName(),
                    u.getBio(), u.getInstitution(), u.getRole(), u.getCreatedAt()
            );
        }
    }

    public record AuthResponse(
            String accessToken,
            String refreshToken,
            long expiresInMs,
            UserResponse user
    ) {}

    public record PasswordResetInitResponse(
            String message,
            String resetTokenPreview // Only returned in dev/demo when SMTP is not configured
    ) {}
}
