# Production image is built from the repository root.
# See /Dockerfile and deploy/docker-compose.prod.yml
#
# Dev-only quick build (no UI):
#   docker build -t dataop-api-dev .

FROM golang:alpine AS builder

ENV GO111MODULE=on \
    CGO_ENABLED=0

WORKDIR /build
COPY . .
RUN go mod tidy
RUN go build --ldflags "-s -w -extldflags -static" -o main .

FROM alpine:latest

WORKDIR /www

COPY --from=builder /build/main /www/
COPY --from=builder /build/resources/ /www/resources/

# .env is supplied at runtime via env_file / environment — never bake secrets in.
ENTRYPOINT ["/www/main"]
