# Madressa Portal – Full‑Stack TypeScript Application

A full‑stack Madressa management portal built with:

- **React + TypeScript** (frontend)
- **Node.js + Express + TypeScript** (backend)
- **MySQL** (database)
- **JWT authentication with secure HTTP‑only cookies**
- **Role‑based access control** (student, teacher, admin)
- **Docker Compose support** for easy local development

## Project Structure

madressa-portal/
│
├── backend/        # Node.js + Express + TypeScript API
└── frontend/       # React + TypeScript client



## Running with Docker (Recommended)

This is the easiest way to run the entire stack locally.

### 1. Start everything

```bash
docker-compose up --build
```
#### 2. Access the services

Frontend → http://localhost:5173

Backend API → http://localhost:4000

MySQL → localhost:3306 (user: root / password: rootpassword)

#### 3. Stop everything
```bash
docker-compose down
```

### API Overview
Auth
``` POST /auth/register ```

``` POST /auth/login ```

``` POST /auth/logout ```

Admin
``` POST /admin/classes ```

``` POST /admin/users/:id/grant-teacher ```

``` GET /admin/users ```

Teacher
``` GET /teacher/classes ```

``` GET /teacher/classes/:classId/students ```

``` POST /teacher/classes/:classId/attendance ```