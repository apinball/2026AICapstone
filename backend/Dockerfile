FROM node:20-alpine

WORKDIR /app

# 1) 프론트엔드 빌드
COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 2) 백엔드 설치
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev

COPY backend/src/ ./backend/src/

EXPOSE 3000

WORKDIR /app/backend
CMD ["node", "src/index.js"]
