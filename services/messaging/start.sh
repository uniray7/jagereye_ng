#!/usr/local/bin/bash

# start the prometheus exporter
/prometheus-nats-exporter -varz "http://localhost:${1}" &

# Run via the configuration file
/gnatsd -c gnatsd.conf
