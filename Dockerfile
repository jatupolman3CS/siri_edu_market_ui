# SIRIEDUMARKET web (Angular 21, zoneless) — served by nginx and reverse-proxying the API.
#
# โหมด single-origin (docker-compose ที่ root): service `web` map `${WEB_PORT:-8080}:80`
# และ nginx/nginx.conf proxy `/api/` ไปที่ service `backend:8080` — ต้อง build ด้วย
# `--build-arg NGINX_CONF=nginx/nginx.conf` เพราะ ARG default ด้านล่างเป็น nginx.web.conf
# (ห้าม rename service — nginx.conf อ้างชื่อ service ตรง ๆ · API ตอบที่ root ไม่มี path base)

# ---- build ----
# Angular 21 ต้องใช้ Node ^20.19 || ^22.12 || >=24 — pin 22-alpine ไว้ให้ตรงกับ CI
FROM node:22-alpine AS build
WORKDIR /app

# ติดตั้ง dependency แยก layer: แก้แค่ source code จะไม่ทำให้ npm ci รันใหม่
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# defaultConfiguration ของ target build คือ production อยู่แล้ว (angular.json)
RUN npm run build

# ชื่อ project ใน angular.json = siriedumarket-web → dist/siriedumarket-web/browser
# เผื่อ builder รุ่นเก่าที่ยังไม่แยกโฟลเดอร์ browser/ ไว้ด้วย
RUN if [ -d "dist/siriedumarket-web/browser" ]; then \
        cp -r dist/siriedumarket-web/browser /tmp/webroot; \
    elif [ -d "dist/siriedumarket-web" ]; then \
        cp -r dist/siriedumarket-web /tmp/webroot; \
    else \
        echo "Angular build output not found"; \
        ls -la dist; \
        exit 1; \
    fi

# ---- runtime ----
FROM nginx:1.27-alpine AS runtime
WORKDIR /usr/share/nginx/html

# ค่า default จริงคือ nginx.web.conf (SPA อย่างเดียว listen 8085) — ไม่ใช่ nginx/nginx.conf
# (คอมเมนต์เดิมเขียนสลับกับของจริง จึงเข้าใจผิดกันมาตลอด)
#
# nginx.web.conf  : เสิร์ฟ SPA อย่างเดียว listen 8085 — **ไม่มี proxy /api/**
#                   ดังนั้น deployment ต้องให้เบราว์เซอร์ยิง API ที่ hostname ของ API เอง
#                   (คนละ origin กับเว็บ) และ `Api:PublicBaseUrl` ฝั่ง backend **ต้องชี้ไปที่
#                   origin ของ API** เพราะ backend เอาค่านี้ไปประกอบ URL ของไฟล์สาธารณะทุกตัว
#                   (cover, gallery, preview) ถ้าชี้ไปที่ origin ของเว็บ URL พวกนั้นจะตกไปเข้า
#                   `location ~* \.(...|jpg|png|svg|webp)$ { try_files $uri =404; }` ของไฟล์นี้
#                   → รูปทั้งระบบ 404 เป็น HTML ทั้งหมด ทุก role (seller/admin/buyer)
# nginx/nginx.conf: SPA + `location ^~ /api/` proxy ไป http://backend:8080/api/ listen 80
#                   (single-origin ตาม docker-compose ที่ root ซึ่ง map `${WEB_PORT:-8080}:80`
#                   และ healthcheck ยิง http://localhost/api/system/status ผ่าน proxy ตัวนี้)
#                   `^~` ห้ามถอด — ไม่งั้น regex location ของไฟล์รูปจะแย่ง /api/files/download/*.webp
#
# สลับ config ได้ตอน build: --build-arg NGINX_CONF=nginx/nginx.conf
# (เปลี่ยน config = เปลี่ยน port ที่ container listen ด้วย 8085 ↔ 80 ต้องแก้ port mapping ให้ตรง)
ARG NGINX_CONF=nginx.web.conf

RUN rm -rf ./*
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/webroot/ /usr/share/nginx/html/

# ตรงกับ default (nginx.web.conf listen 8085) — ถ้า build ด้วย NGINX_CONF=nginx/nginx.conf
# container จะ listen 80 แทน ต้อง map port ให้ตรงเอง (EXPOSE เป็นแค่ metadata ไม่ได้เปิด port)
EXPOSE 8085

# healthcheck ของ service `web` ใช้ busybox wget ที่มากับ nginx:alpine
CMD ["nginx", "-g", "daemon off;"]
