# 1. Build Stage
FROM rust:1.75 as builder
WORKDIR /app

# Create a dummy project to cache dependencies
RUN cargo new --bin server
WORKDIR /app/server

# Copy ONLY manifests
COPY ./Cargo.lock ./Cargo.lock
COPY ./Cargo.toml ./Cargo.toml

# Build dependencies only (this layer is cached!)
RUN cargo build --release
RUN rm src/*.rs

# Now copy your actual source code
COPY ./src ./src

# Build the actual app (touch main.rs to force rebuild of your code)
RUN rm ./target/release/deps/server*
RUN cargo build --release

# 2. Runtime Stage
FROM debian:bookworm-slim
WORKDIR /app
# Install OpenSSL (Required for Redis/TLS)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/server/target/release/server .

CMD ["./server"]