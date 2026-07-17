FROM golang:1.25.5-alpine3.23 AS build
RUN GOBIN=/bin go install github.com/cespare/reflex@latest

FROM node:25.2.1-alpine3.23
COPY --from=build /bin/reflex /bin/reflex