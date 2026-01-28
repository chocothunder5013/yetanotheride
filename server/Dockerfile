# Use "latest" to fix the lockfile version error
FROM rust:latest as builder
WORKDIR /app

# Dummy build to cache dependencies
RUN cargo new --bin server
WORKDIR /app/server
COPY ./Cargo.lock ./Cargo.lock
COPY ./Cargo.toml ./Cargo.toml
RUN cargo build --release
RUN rm src/*.rs

# Real build
COPY ./src ./src
RUN rm ./target/release/deps/server*
RUN cargo build --release

# Runtime
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/server/target/release/server .
CMD ["./server"]