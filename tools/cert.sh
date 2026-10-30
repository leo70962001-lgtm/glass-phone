#!/bin/sh
# 自簽 HTTPS 憑證（手機陀螺儀需要安全連線）：涵蓋 localhost 與這台電腦目前的區網 IP
cd "$(dirname "$0")" && mkdir -p cert
IPS=$(ipconfig | grep -a IPv4 | sed 's/.*: *//' | tr -d '\r')
SAN="DNS:localhost,IP:127.0.0.1"
for ip in $IPS; do SAN="$SAN,IP:$ip"; done
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -days 825 -keyout cert/key.pem -out cert/cert.pem \
  -subj "/CN=glass-phone" -addext "subjectAltName=$SAN" -addext "extendedKeyUsage=serverAuth" 2>/dev/null
echo "cert for $SAN"
