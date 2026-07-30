# 프론트엔드(Next.js) 이미지.
# ※ NEXT_PUBLIC_* 는 빌드 시점에 번들에 박히므로 build ARG 로 주입한다.
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# 백엔드 API 주소(빌드 타임 주입). compose/CI 에서 값 전달.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

RUN npm run build

EXPOSE 3000
CMD ["npm", "start"]
