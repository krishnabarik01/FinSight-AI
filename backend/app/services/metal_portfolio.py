"""
FinSight AI — Metal Portfolio Service
Bridges existing Metals Bullion services (gold_data and silver_data)
with the Portfolio Manager to support Gold and Silver holdings.
"""

from typing import Dict, Any, Optional
from app.services.gold_data import get_gold_snapshot
from app.services.silver_data import get_silver_snapshot


def get_metal_price_quote(metal_type: str, purity: str, city: Optional[str] = "Visakhapatnam") -> Dict[str, Any]:
    """
    Reuses existing Metals Bullion services to retrieve authentic live per-gram price
    in INR for the requested metal and purity (24K, 22K, 18K for Gold; 999, 925 for Silver).
    Never fabricates prices; strictly adheres to genuine domestic snapshots or benchmark conversions.
    """
    clean_metal = metal_type.upper().strip()
    clean_purity = purity.upper().strip().replace(" ", "")

    if clean_metal == "GOLD":
        snap = get_gold_snapshot(city=city)
        karats = snap.get("karats", {})
        
        # Determine target purity
        if "22" in clean_purity:
            purity_display = "22K"
            p_key_1g = "22k_1g"
            p_key_10g = "22k_10g"
            dom_key = "22k"
            ratio = 22.0 / 24.0
        elif "18" in clean_purity:
            purity_display = "18K"
            p_key_1g = "18k_1g"
            p_key_10g = "18k_10g"
            dom_key = "18k"
            ratio = 18.0 / 24.0
        else:
            purity_display = "24K"
            p_key_1g = "24k_1g"
            p_key_10g = "24k_10g"
            dom_key = "24k"
            ratio = 1.0

        price_per_g = karats.get(p_key_1g)
        if price_per_g is None:
            dom_purities = snap.get("domestic_rates", {}).get("purities", {}) if snap.get("domestic_rates") else {}
            if dom_key in dom_purities:
                price_per_g = dom_purities[dom_key].get("final_price_per_g")
                
        if price_per_g is None:
            ten_g = karats.get(p_key_10g) or snap.get("inr_per_10g_estimate") or snap.get("inr_per_10g_forex_parity")
            if ten_g:
                price_per_g = round((float(ten_g) * ratio) / 10.0, 2)
            else:
                price_per_g = 0.0

        return {
            "metal_type": "GOLD",
            "purity": purity_display,
            "company_name": f"Gold ({purity_display})",
            "symbol": f"GOLD-{purity_display}",
            "sector": "Precious Metals",
            "current_price": round(float(price_per_g), 2),
            "currency": "INR",
            "unit": "INR/g",
            "change_pct": float(snap.get("change_pct", 0.0)),
            "is_stale": snap.get("is_stale", False),
            "last_updated": snap.get("last_updated") or snap.get("market_timestamp"),
        }

    elif clean_metal == "SILVER":
        snap = get_silver_snapshot(city=city)
        if "925" in clean_purity:
            purity_display = "925"
            dom_key = "silver925"
            ratio = 0.925
        else:
            purity_display = "999"
            dom_key = "silver999"
            ratio = 1.0

        dom_rates = snap.get("domestic_rates")
        price_per_g = None
        if dom_rates and "purities" in dom_rates:
            if dom_key in dom_rates["purities"]:
                price_per_g = dom_rates["purities"][dom_key].get("final_price_per_g")

        if price_per_g is None:
            base_1g = snap.get("price_per_gram") or snap.get("inr_per_1g")
            if base_1g:
                price_per_g = round(float(base_1g) * ratio, 2)
            else:
                kg_price = snap.get("price_per_kg") or snap.get("inr_per_kg_forex_parity") or snap.get("inr_per_kg")
                if kg_price:
                    price_per_g = round((float(kg_price) / 1000.0) * ratio, 2)
                else:
                    price_per_g = 0.0

        return {
            "metal_type": "SILVER",
            "purity": purity_display,
            "company_name": f"Silver {purity_display}",
            "symbol": f"SILVER-{purity_display}",
            "sector": "Precious Metals",
            "current_price": round(float(price_per_g), 2),
            "currency": "INR",
            "unit": "INR/g",
            "change_pct": float(snap.get("change_pct", 0.0)),
            "is_stale": snap.get("is_stale", False),
            "last_updated": snap.get("last_updated") or snap.get("market_timestamp"),
        }
    else:
        raise ValueError(f"Unsupported metal type '{metal_type}'. Supported types are 'GOLD' and 'SILVER'.")
