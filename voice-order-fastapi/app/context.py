from __future__ import annotations

import csv
from collections import OrderedDict, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Iterable, List, Dict, NamedTuple

from app.config import settings, APP_DIR


BASE_SYSTEM_PROMPT = f"""당신은 "Mr.Daeback 디너"의 전담 책임자이자 주문 챗봇입니다. 고객 언어를 즉시 감지해 같은 언어로만 응답하고, 고객이 다시 전환하기 전까지는 언어를 임의로 바꾸지 마세요. 오늘 날짜는 {settings.VOICE_ORDER_ASSUMED_DELIVERY_DATE}로 간주하고, 상대 날짜 표현을 모두 이 날짜 기준의 실제 달력 날짜·시간으로 적으세요.

[대화 시작 예시]
- 시스템: 안녕하세요, {{이름}} 고객님. 원하시는 디너 주문을 말씀해 주세요.
- 고객: 맛있는 디너 추천해 주세요.
- 시스템: 혹시 어떤 기념일이거나 특별한 이유가 있으실까요?

[대화 진행 체크리스트]
0. 진행 순서는 인사/목적 확인 → 메뉴 추천·선정 → 스타일 설명·선정 → 변경·추가 요청 확인 → 배달 일정 확인 → 최종 확인·토큰입니다.
1. 첫 인사에서는 반드시 고객 이름을 부르고, 기념일/목적을 확인한 뒤에 다른 질문으로 넘어갑니다. 이후에도 한 번의 질문에서는 한 가지 주제만 묻습니다. **메뉴 추천 시 반드시 어울리는 2개만 선택해서 bullet으로 나열**하되, 각 메뉴는 1줄로 간결하게 소개합니다.  
   - 메뉴 추천 시에는 **아래 제공된 모든 메뉴 중에서** 고객의 기념일/목적, 예상 인원수, 가격, 구성을 종합적으로 고려해 가장 어울리는 서로다른 2개를 선택합니다.  
   - 절대로 상단에 있는 메뉴 2개를 기계적으로 선택하지 말고, 항상 같은 2개만 반복 추천하지 않도록 주의합니다.  
   - 고객이 기념일/특별한 이유를 언급하면 간단히 축하하고 바로 bullet으로 어울리는 메뉴 2개를 나열합니다.
   - 한 턴에서 메뉴 목록은 한 번만 출력합니다. 같은 메뉴를 재정렬하거나 다시 나열해 두 번째 목록을 만들지 말고, 목록 뒤에는 한 문장으로 선택만 요청하세요.
2. 메뉴가 정해진 뒤에는 해당 메뉴를 끝까지 유지하고 절대로 다른 메뉴로 바꾸지 마세요. 메뉴에 대한 추가 설명을 하지 말고, 바로 서빙 스타일(심플/그랜드/디럭스)을 각각 bullet으로 간결하게 설명합니다. 스타일 선택과 다른 주제를 섞지 말고 순서대로 확정합니다. 스타일이 정해진 직후에는 스타일에 대한 추가 설명을 하지 말고, 바로 "스타일·음식·음료 수량을 조정 가능합니다. 수량을 변경하시겠어요?"라고 묻습니다.
3. 고객 요청에 따라 구성/수량을 조정하되 스타일·음식·음료만 변경 가능함을 안내합니다. 음식·주류·커피는 수량/추가·삭제 가능, 접시·냅킨·장식 등 비식품은 변경 불가합니다.
   - 변경 완료 후에는 변경된 항목만 간단히 확인하고 바로 다음 단계로 넘어갑니다. 전체 구성품을 다시 나열하거나 중복해서 적지 마세요.
   - **절대적 규칙: 오직 아래 [추가 가능한 음식] 목록에 있는 음식만 추가 가능합니다. 목록에 없는 음식은 절대 추가하지 마세요.**
   - **중요: 고객이 시스템에 등록된 음식(아래 [추가 가능한 음식] 목록에 있는 항목)을 추가 요청하면, 되묻지 않고 바로 추가 처리합니다. 예: "베이컨 추가해주세요" → "베이컨을 추가했습니다"라고 바로 확인합니다.**
   - **중요: 고객이 데이터베이스에 없는 음식(아래 [추가 가능한 음식] 목록에 없는 항목)을 요청하면, 절대 추가하지 않고 "죄송합니다. 해당 항목은 준비되어 있지 않습니다. 아래 항목 중에서 선택해 주세요: [목록]"라고 안내합니다.**
4. 배달 날짜와 시간을 반드시 고객에게 직접 질문합니다(예: "배달 날짜와 시간을 알려주세요") 절대로 시간을 추측하거나 제안하지 마세요. "내일/모레" 같은 상대 날짜를 들으면 반드시 실제 달력 날짜로 변환해 "YYYY-MM-DD HH:00" 형식으로 기록하세요.
5. 메뉴·스타일·변경사항·배달 일정을 간단히 요약한 뒤 "추가 변경사항이나 요청이 있으신가요?"라고 묻습니다. 고객이 명확히 동의하기 전에는 주문 완료/확정/번호/토큰을 언급하지 말고, 동의 후에만 최종 확정 멘트와 <<CONFIRM_ORDER>>를 단 한 번 사용합니다.

[언어·정보·설명 규칙]
- 이미 안내한 내용(메뉴/스타일/구성 설명 등)을 반복하지 말고, 변경 사항만 간단히 확인하세요.
- 문장은 자연스럽고 일상적인 톤으로 짧게 말합니다.
- **가격 정보는 절대 자동으로 언급하지 마세요. 고객이 직접 "가격이 얼마인가요?", "비용은?", "돈은?" 등으로 명시적으로 물어볼 때만 답변하세요. 메뉴 설명, 구성품 설명, 주문 확인 등 어떤 상황에서도 가격을 먼저 말하지 마세요.**
- 존재하지 않는 메뉴/스타일이 요청되면 준비되어 있지 않음을 먼저 알리고, 철자나 분위기가 유사한 실제 옵션을 추천합니다.
- 메뉴/스타일/구성과 많이 다른 주문(목록에 없는 항목, 임의 조합 등)이 오면 그대로 진행하지 말고 "준비된 메뉴/스타일과 다르니 다시 선택해 달라"고 안내한 뒤, 실제 메뉴를 근거와 함께 재제안하세요.
- **데이터베이스에 없는 음식 추가 요청: 고객이 [추가 가능한 음식] 목록에 없는 음식을 요청하면 절대 추가하지 마세요. "해당 항목은 준비되어 있지 않습니다"라고 안내하고, [추가 가능한 음식] 목록에서 선택하도록 안내하세요.**

[주문 확정 규칙]
- 메뉴, 스타일, 배달 날짜·시간, 변경사항이 모두 확인되고 고객이 최종 동의한 경우에만 주문을 확정합니다.
- 최종 확정 메시지 형식: "{{이름}} 고객님, 메뉴명, 스타일명, 구성품 나열을 YYYY-MM-DD X시에 배달하겠습니다. 감사합니다. <<CONFIRM_ORDER>>"
- 반드시 상대 표현("내일", "모레" 등)을 실제 달력 날짜로 변환하고, 토큰은 응답 마지막에 한 번만 사용합니다.
- 필요한 정보가 빠져 있으면 토큰을 사용하지 말고 추가 질문을 하세요.

아래에는 미스터 대박의 메뉴·스타일·가격 정보가 이어집니다."""


class CatalogData(NamedTuple):
    """Holds all parsed catalog CSV data."""
    menus: List[Dict[str, str]]
    menu_items: List[Dict[str, str]]
    styles: List[Dict[str, str]]


def _data_dir() -> Path:
    override_dir = getattr(settings, "VOICE_ORDER_MENU_DATA_DIR", None)
    if override_dir:
        return Path(override_dir).expanduser().resolve()
    return (APP_DIR / "data").resolve()


def _parse_catalog_csv(path: Path) -> List[Dict[str, str]]:
    """Parse CSV file with error handling and validation."""
    if not path.exists():
        return []

    try:
        with path.open(encoding="utf-8") as fp:
            reader = csv.DictReader(fp)
            return [
                {key: (value or "").strip() for key, value in row.items()}
                for row in reader
                if any((value or "").strip() for value in row.values())
            ]
    except (csv.Error, UnicodeDecodeError, IOError) as e:
        # Log the error but return empty list to allow system to continue
        print(f"Warning: Failed to parse CSV {path}: {e}")
        return []


def _normalize_menu_key(value: str) -> str:
    """Normalize menu identifiers so names/IDs can be matched flexibly."""
    if not value:
        return ""
    return " ".join(value.strip().split()).casefold()


def _extract_menu_key(entry: Dict[str, str], candidate_fields: Iterable[str]) -> str:
    """Return a normalized key from the first non-empty field in candidate_fields."""
    for field in candidate_fields:
        raw_value = entry.get(field)
        if raw_value:
            key = _normalize_menu_key(raw_value)
            if key:
                return key
    return ""


@lru_cache()
def _load_all_catalog_data() -> CatalogData:
    """Load all catalog CSV files once and cache the result."""
    data_dir = _data_dir()
    return CatalogData(
        menus=_parse_catalog_csv(data_dir / "menus.csv"),
        menu_items=_parse_catalog_csv(data_dir / "menu_items.csv"),
        styles=_parse_catalog_csv(data_dir / "styles.csv")
    )


def _format_structured_catalog(
    menus: Iterable[Dict[str, str]],
    menu_items: Iterable[Dict[str, str]],
    styles: Iterable[Dict[str, str]],
) -> str:
    # menus.csv now uses the menu 이름 as the primary key, so we normalize by name.
    components: Dict[str, List[Dict[str, str]]] = defaultdict(list)
    item_catalog: OrderedDict[str, Dict[str, str]] = OrderedDict()

    for item in menu_items:
        menu_name = (item.get("menu_name") or item.get("menu") or item.get("menu_id") or "").strip()
        menu_key = _normalize_menu_key(menu_name)
        if menu_key:
            components[menu_key].append(item)

        comp_name = (item.get("item_name") or "").strip()
        key = comp_name.casefold()
        if comp_name and key not in item_catalog:
            item_catalog[key] = item

    menu_lines: List[str] = []
    for menu in menus:
        name = (menu.get("name") or "").strip()
        menu_key = _normalize_menu_key(name)
        price = menu.get("price") or ""
        servings = menu.get("servings") or ""
        description = menu.get("description") or ""
        price_info = f" ({price}원)" if price else ""
        servings_info = f" / 기준 {servings}인분" if servings else ""
        description_info = f": {description}" if description else ""
        menu_lines.append(f"- {name}{price_info}{servings_info}{description_info}")

        for component in components.get(menu_key, []):
            comp_name = component.get("item_name") or ""
            qty = component.get("default_qty") or "1"
            unit_price = component.get("unit_price") or ""
            price_info = f" ({unit_price}원)" if unit_price else ""
            menu_lines.append(f"  · {comp_name} x {qty}{price_info}")

    if not menu_lines:
        menu_lines.append("- 등록된 메뉴 정보가 없습니다.")

    style_lines: List[str] = []
    for style in styles:
        name = style.get("name") or ""
        description = style.get("description") or ""
        notes = style.get("notes") or ""
        summary = description or "설명 없음"
        notes_info = f" ({notes})" if notes else ""
        style_lines.append(f"- {name}: {summary}{notes_info}")

    if not style_lines:
        style_lines.append("- 등록된 스타일 정보가 없습니다.")

    # 추가 가능한 모든 음식 목록 (메뉴 기본 구성에 없는 음식도 포함)
    all_available_items = set()
    for item in menu_items:
        item_name = item.get("item_name", "").strip()
        if item_name:
            all_available_items.add(item_name)
    
    available_items_section = ""
    if all_available_items:
        sorted_items = sorted(all_available_items)
        available_items_section = f"\n[추가 가능한 음식]\n다음 음식들은 어떤 메뉴에도 추가로 주문 가능합니다. 고객이 요청하면 되묻지 않고 바로 추가하세요:\n" + ", ".join(sorted_items) + "\n"

    menu_section = "\n".join(menu_lines)
    style_section = "\n".join(style_lines)

    return (
        f"\n\n[메뉴 목록]\n{menu_section}\n\n"
        f"[서빙 스타일]\n{style_section}\n"
        f"{available_items_section}"
        "**중요: 가격 정보는 절대 언급하지 마세요. 고객이 직접 물어볼 때만 답변하세요.**"
    )


@lru_cache()
def get_system_prompt() -> str:
    """Get system prompt with all catalog data loaded once and cached."""
    catalog = _load_all_catalog_data()
    formatted = _format_structured_catalog(catalog.menus, catalog.menu_items, catalog.styles)
    return BASE_SYSTEM_PROMPT + formatted
