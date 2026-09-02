# SIRIEDUMARKET web (Angular 21, zoneless) — served by nginx and reverse-proxying the API.
#
# ต้องคู่กับ docker-compose.yml ที่ root: service `web` map `${WEB_PORT:-8080}:80`
# และ nginx/nginx.conf proxy `/api/` ไปที่ service `backend:8080`
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

# default = nginx/nginx.conf (proxy /api/ ไป service backend ตาม compose)
# สลับเป็น SPA อย่างเดียวได้ด้วย --build-arg NGINX_CONF=nginx.web.conf
ARG NGINX_CONF=nginx.web.conf

RUN rm -rf ./*
COPY ${NGINX_CONF} /etc/nginx/conf.d/default.conf
COPY --from=build /tmp/webroot/ /usr/share/nginx/html/

# nginx/nginx.conf listen 80 — compose เป็นคน map port ออกภายนอกเอง
EXPOSE 8085

# healthcheck ของ service `web` ใช้ busybox wget ที่มากับ nginx:alpine
CMD ["nginx", "-g", "daemon off;"]
