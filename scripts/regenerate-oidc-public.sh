#!/bin/sh
# สร้าง .oidc-public.pem จาก .oidc-private.pem (ต้องเป็นคู่เดียวกัน จึงจะ verify ได้)
cd "$(dirname "$0")/.."
if [ ! -f .oidc-private.pem ]; then
  echo "ไม่มีไฟล์ .oidc-private.pem สร้างคู่คีย์ก่อน:"
  echo "  openssl genrsa 2048 | openssl pkcs8 -topk8 -nocrypt -out .oidc-private.pem"
  echo "  ./scripts/regenerate-oidc-public.sh"
  exit 1
fi
openssl rsa -in .oidc-private.pem -pubout -out .oidc-public.pem
echo "สร้าง .oidc-public.pem จาก .oidc-private.pem เรียบร้อย"
