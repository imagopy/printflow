# PrintFlow Deployment Guide

## Deploying to Railway via GitHub

### Prerequisites
- GitHub account
- Railway account
- SendGrid or AWS SES account (for emails)
- AWS S3 or Cloudflare R2 account (for file storage)

### Step 1: Push to GitHub

1. Create a new repository on GitHub
2. Initialize git and push your code:

```bash
cd /workspace/printflow
git init
git add .
git commit -m "Initial commit: PrintFlow MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/printflow.git
git push -u origin main
```

### Step 2: Set up Railway Project

1. Go to [Railway Dashboard](https://railway.app/dashboard)
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Connect your GitHub account and select the `printflow` repository

### Step 3: Configure Services

Railway will detect the monorepo structure. You'll need to set up:

#### 1. PostgreSQL Database
- Click "New" → "Database" → "PostgreSQL"
- Railway will automatically provide `DATABASE_URL`

#### 2. Redis (Optional, for rate limiting)
- Click "New" → "Database" → "Redis"
- Note the connection URL

#### 3. Backend Service
- Click "New" → "GitHub Repo"
- Select your repository
- Set root directory to `/backend`
- Configure environment variables:
  ```
  NODE_ENV=production
  PORT=3001
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  JWT_SECRET=<generate-secure-secret>
  CORS_ORIGIN=<frontend-url-after-deployment>
  # Add email and storage configs
  ```

#### 4. Frontend Service
- Click "New" → "GitHub Repo"
- Select your repository
- Set root directory to `/frontend`
- Configure environment variables:
  ```
  VITE_API_URL=<backend-service-url>
  ```

### Step 4: Environment Variables

Copy all variables from `.env.railway.example` to your Railway services:

1. Go to each service's Settings → Variables
2. Add the required environment variables
3. Use Railway's reference variables for database URLs

### Step 5: Deploy

1. Railway will automatically deploy when you push to GitHub
2. Monitor the deployment logs
3. Once deployed, Railway will provide URLs for each service

### Step 6: Post-Deployment

1. **Run Database Migrations**:
   - Go to backend service
   - Open the shell
   - Run: `npx prisma migrate deploy`

2. **Seed Initial Data** (optional):
   - Run: `npx prisma db seed`

3. **Update CORS**:
   - Update backend's `CORS_ORIGIN` with frontend URL
   - Update frontend's `VITE_API_URL` with backend URL

### Custom Domains

1. Go to service Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed

### Monitoring

- Use Railway's built-in metrics
- Check logs: `railway logs`
- Set up health checks in `railway.json`

### Troubleshooting

#### Database Connection Issues
- Ensure `DATABASE_URL` is using Railway's reference variable
- Check if migrations have run

#### CORS Errors
- Verify `CORS_ORIGIN` matches your frontend URL exactly
- Include protocol (https://)

#### Build Failures
- Check build logs for missing dependencies
- Ensure all environment variables are set
- Verify Node.js version compatibility

### Scaling

1. **Horizontal Scaling**:
   - Adjust replicas in service settings
   - Configure in `railway.json`:
     ```json
     {
       "deploy": {
         "numReplicas": 3
       }
     }
     ```

2. **Vertical Scaling**:
   - Upgrade service resources in Railway dashboard

### Backup Strategy

1. **Database Backups**:
   - Railway provides automatic backups
   - Configure backup schedule in database settings

2. **File Storage**:
   - S3/R2 provides built-in redundancy
   - Configure lifecycle policies for cost optimization

### CI/CD Pipeline

The GitHub Actions workflow will:
1. Run tests on every push
2. Lint code
3. Build and type-check
4. Railway auto-deploys on successful CI

### Security Checklist

- [ ] Strong JWT secret
- [ ] Database connection uses SSL
- [ ] Environment variables are secure
- [ ] Rate limiting is enabled
- [ ] CORS is properly configured
- [ ] HTTPS is enforced
- [ ] Security headers are set (helmet.js)

### Cost Optimization

1. Use Railway's usage-based pricing
2. Configure auto-sleep for development environments
3. Optimize database queries
4. Use CDN for static assets
5. Configure proper caching headers