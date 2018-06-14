FROM golang:alpine as builder

RUN apk --no-cache add curl git make perl
RUN curl -s https://glide.sh/get | sh
WORKDIR /go/src/github.com/dcu/mongodb_exporter
RUN git clone https://github.com/dcu/mongodb_exporter.git .
RUN glide install && mkdir -p release && \
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o release/mongodb_exporter-linux-amd64 -a -tags netgo -ldflags '-w -extldflags "-static"'

FROM mongo:3.6.0

MAINTAINER uniray7 uniray7@gmail.com

# TODO: need add access control setting

COPY --from=builder /go/src/github.com/dcu/mongodb_exporter/release/mongodb_exporter-linux-amd64 /mongodb_exporter
COPY start.sh /start.sh

RUN chmod +x /mongodb_exporter && chmod +x /start.sh

EXPOSE 27017 9001

CMD ["/start.sh"]
