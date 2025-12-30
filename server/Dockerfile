# Build Stage
FROM rust:latest as builder
WORKDIR /app
COPY . .
# Build release binary (optimized)
RUN cargo build --release

# Runtime Stage
FROM debian:bookworm-slim
WORKDIR /app
# Install OpenSSL (often needed for dependencies)
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/server .
CMD ["./server"]
