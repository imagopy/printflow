# Guía de Deploy en Railway - Por Partes

## Parte 1: Backend + Base de Datos

### Paso 1: Crear Proyecto en Railway

1. Ve a [Railway Dashboard](https://railway.app/dashboard)
2. Click en **"New Project"**
3. Selecciona **"Empty Project"** (proyecto vacío)

### Paso 2: Agregar PostgreSQL

1. Dentro del proyecto, click **"+ New"**
2. Selecciona **"Database"** → **"Add PostgreSQL"**
3. Railway creará automáticamente la base de datos

### Paso 3: Agregar el Backend

1. Click **"+ New"** → **"GitHub Repo"**
2. Conecta tu cuenta de GitHub si no lo has hecho
3. Selecciona **imagopy/printflow**
4. **IMPORTANTE**: En la configuración:
   - **Root Directory**: `/backend`
   - **Start Command**: `npm run start`

### Paso 4: Variables de Entorno del Backend

1. Click en el servicio del backend
2. Ve a **"Variables"**
3. Click **"Raw Editor"**
4. Copia y pega estas variables:

```env
# Base de datos - Railway la conecta automáticamente
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Servidor
NODE_ENV=production
PORT=${{PORT}}

# JWT - CAMBIA ESTO!
JWT_SECRET=genera-un-secreto-seguro-aqui-minimo-32-caracteres
JWT_EXPIRES_IN=7d

# CORS - Por ahora permite localhost
CORS_ORIGIN=http://localhost:5173

# Email (opcional por ahora)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=noreply@tudominio.com
SENDGRID_FROM_NAME=PrintFlow

# Storage (opcional por ahora)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=
AWS_S3_REGION=us-east-1

# Info de la empresa
COMPANY_NAME=Mi Imprenta
COMPANY_ADDRESS=Calle Principal 123
COMPANY_PHONE=+1 (555) 123-4567
COMPANY_EMAIL=info@miimprenta.com
COMPANY_WEBSITE=https://miimprenta.com
```

### Paso 5: Configurar Build y Deploy

1. En **Settings** del backend
2. En **Deploy**:
   - **Build Command**: `npm install && npx prisma generate && npm run build`
   - **Start Command**: `npm run start`

### Paso 6: Deploy Inicial

1. Railway comenzará el deploy automáticamente
2. Espera a que termine (5-10 minutos)
3. Verifica los logs para asegurarte que no hay errores

### Paso 7: Configurar Base de Datos

1. Una vez desplegado, ve al servicio del backend
2. Click en **"View Logs"**
3. Abre una nueva terminal en Railway:
   - Click en el servicio
   - Ve a **"Settings"**
   - Click **"Shell"** o usa Railway CLI

4. Ejecuta estos comandos:

```bash
# Aplicar migraciones
npx prisma migrate deploy

# Opcional: Cargar datos de prueba
SEED_DATABASE=true npm run db:seed
```

### Paso 8: Verificar el Backend

1. Railway te dará una URL como: `https://printflow-backend.up.railway.app`
2. Prueba la API:
   ```
   https://tu-backend-url.railway.app/health
   ```
3. Deberías ver: `{"status":"ok","timestamp":"..."}`

---

## Parte 2: Frontend (Después de verificar el backend)

### Paso 1: Agregar el Frontend

1. En el mismo proyecto, click **"+ New"** → **"GitHub Repo"**
2. Selecciona **imagopy/printflow** otra vez
3. En la configuración:
   - **Root Directory**: `/frontend`

### Paso 2: Variables de Entorno del Frontend

1. Click en el servicio del frontend
2. Ve a **"Variables"**
3. Agrega:

```env
VITE_API_URL=https://tu-backend-url.railway.app
```

**IMPORTANTE**: Reemplaza `tu-backend-url` con la URL real de tu backend

### Paso 3: Actualizar CORS en el Backend

1. Vuelve al servicio del backend
2. En **Variables**, actualiza:
   ```env
   CORS_ORIGIN=https://tu-frontend-url.railway.app
   ```

### Paso 4: Deploy del Frontend

1. Railway desplegará automáticamente
2. Espera 3-5 minutos
3. Obtendrás una URL como: `https://printflow-frontend.up.railway.app`

---

## Verificación Final

### 1. Probar la Aplicación

1. Abre la URL del frontend
2. Deberías ver la página de login
3. Usa las credenciales de prueba:
   - Admin: `admin@printflow.com` / `admin123`
   - Sales: `sales@printflow.com` / `sales123`

### 2. Solución de Problemas Comunes

#### Error de CORS
- Verifica que `CORS_ORIGIN` en el backend coincida exactamente con la URL del frontend
- Incluye `https://` al principio

#### Error de Base de Datos
- Verifica que las migraciones se ejecutaron
- Revisa los logs del backend

#### Frontend no conecta al Backend
- Verifica que `VITE_API_URL` esté correcta
- No incluyas `/` al final de la URL

---

## Comandos Útiles de Railway CLI

```bash
# Ver logs
railway logs

# Abrir shell
railway shell

# Ver variables
railway variables

# Redeploy
railway up
```

## Próximos Pasos

1. **Configurar dominio personalizado**
2. **Agregar servicio de email** (SendGrid)
3. **Configurar almacenamiento** (S3/R2)
4. **Habilitar backups** de la base de datos
5. **Configurar monitoreo**

¡Felicidades! Tu aplicación PrintFlow está en producción 🎉