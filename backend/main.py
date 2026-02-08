from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base
from routers import inference, data
import config

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="NeuroLabel API",
    description="Backend for NeuroLabel AI - Autonomous Vehicle Labeling Tool",
    version="2.0.0"
)

# Enable CORS for Production (Allow all origins for demo purposes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow any frontend URL (Netlify/Vercel/Render)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(inference.router, tags=["Inference"])
app.include_router(data.router, tags=["Data Management"])

@app.get("/")
def home():
    return {
        "status": "active", 
        "system": "NeuroLabel Backend Service", 
        "version": "2.0.0"
    }

