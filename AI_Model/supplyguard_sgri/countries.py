from __future__ import annotations


COUNTRY_ALIASES = {
    "대한민국": "KOR",
    "한국": "KOR",
    "south korea": "KOR",
    "korea": "KOR",
    "중국": "CHN",
    "china": "CHN",
    "일본": "JPN",
    "japan": "JPN",
    "미국": "USA",
    "united states": "USA",
    "usa": "USA",
    "베트남": "VNM",
    "vietnam": "VNM",
    "인도": "IND",
    "india": "IND",
    "인도네시아": "IDN",
    "indonesia": "IDN",
    "태국": "THA",
    "thailand": "THA",
    "말레이시아": "MYS",
    "malaysia": "MYS",
    "싱가포르": "SGP",
    "singapore": "SGP",
    "대만": "TWN",
    "taiwan": "TWN",
    "필리핀": "PHL",
    "philippines": "PHL",
    "독일": "DEU",
    "germany": "DEU",
    "프랑스": "FRA",
    "france": "FRA",
    "영국": "GBR",
    "united kingdom": "GBR",
    "이탈리아": "ITA",
    "italy": "ITA",
    "네덜란드": "NLD",
    "netherlands": "NLD",
    "폴란드": "POL",
    "poland": "POL",
    "캐나다": "CAN",
    "canada": "CAN",
    "멕시코": "MEX",
    "mexico": "MEX",
    "브라질": "BRA",
    "brazil": "BRA",
    "호주": "AUS",
    "australia": "AUS",
    "러시아": "RUS",
    "russia": "RUS",
    "튀르키예": "TUR",
    "터키": "TUR",
    "turkey": "TUR",
    "사우디아라비아": "SAU",
    "saudi arabia": "SAU",
    "아랍에미리트": "ARE",
    "united arab emirates": "ARE",
    "방글라데시": "BGD",
    "bangladesh": "BGD",
    "캄보디아": "KHM",
    "cambodia": "KHM",
}


def normalize_country(value: object, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field} is required")
    alias = COUNTRY_ALIASES.get(text.lower())
    if alias:
        return alias
    if 2 <= len(text) <= 3 and text.isascii() and text.isalpha():
        return text.upper()
    raise ValueError(f"{field} must be a supported country name or ISO code")
