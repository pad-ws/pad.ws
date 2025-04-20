FROM node:20-slim as frontend-builder
WORKDIR /app/frontend
COPY src/frontend/package.json src/frontend/yarn.lock ./
RUN yarn install --frozen-lockfile
COPY src/frontend/ ./
RUN yarn build

FROM python:3.11-slim
WORKDIR /app
COPY src/backend /app
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"] 