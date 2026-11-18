# Multi-stage Docker build for NotesIndia Java 21 Spring Boot Backend
FROM maven:3.9.9-eclipse-temurin-21-alpine AS builder
WORKDIR /build

COPY pom.xml .
RUN mvn -B dependency:go-offline

COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S notesindia && adduser -S notesindia -G notesindia
RUN mkdir -p /app/storage && chown -R notesindia:notesindia /app

COPY --from=builder /build/target/notesindia-backend-*.jar app.jar
USER notesindia

EXPOSE 8080
ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
