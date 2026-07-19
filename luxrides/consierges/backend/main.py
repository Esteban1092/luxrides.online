from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os

from supabase_client import get_supabase

app = FastAPI(title="LuxRides Concierge API", version="3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://luxrides.online"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LecturaNFC(BaseModel):
    nfc_tag_id: str
    latitud: Optional[float] = None
    longitud: Optional[float] = None


def verificar_en_supabase(slug: str, nfc_id: str):
    sb = get_supabase()
    res = (
        sb.table("administradores")
        .select("*")
        .eq("url_unica_slug", slug)
        .eq("nfc_tag_id", nfc_id)
        .maybe_single()
        .execute()
    )
    return res.data if res and res.data else None


@app.get("/health")
async def health():
    return {"ok": True, "service": "luxrides-concierge-api"}


@app.post("/v1/nfc/lectura/{url_unica_slug}")
async def procesar_lectura_nfc(url_unica_slug: str, datos: LecturaNFC):
    resultado = verificar_en_supabase(url_unica_slug, datos.nfc_tag_id)

    if not resultado:
        raise HTTPException(
            status_code=401,
            detail="Acceso denegado: Dispositivo o URL no valida para este Administrador.",
        )

    return {
        "success": True,
        "message": f"Lectura procesada con exito para la URL unica: {url_unica_slug}",
        "data": resultado,
    }
