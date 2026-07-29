import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import courseRoutes from './routes/courses.js'
import recordRoutes from './routes/records.js'
import gradeTextRoutes from './routes/grade-texts.js'

const app = express()
const PORT = parseInt(process.env.PORT || '3001', 10)

app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/courses', courseRoutes)
app.use('/api/records', recordRoutes)
app.use('/api/grade-texts', gradeTextRoutes)

// Serve built frontend
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.resolve(__dirname, '../../dist')
app.use(express.static(distPath))
// SPA fallback
app.use((_req, res) => { res.sendFile(path.join(distPath, 'index.html')) })

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
