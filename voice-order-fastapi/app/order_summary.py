from __future__ import annotations

from typing import Iterable, Any

from app.context import _load_all_catalog_data
from app.schemas import ChatMessage, OrderSummary, VoiceOrderItem


SUMMARY_KEYS = [
    "customerName",
    "customerAddress",
    "menuName",
    "menuStyle",
    "menuItems",
    "deliveryTime",
]


def _normalize_menu_key(value: str) -> str:
    if not value:
        return ""
    return " ".join(value.strip().split()).casefold()


def _extract_menu_key(entry: dict[str, str], candidate_fields: Iterable[str]) -> str:
    for field in candidate_fields:
        raw_value = entry.get(field)
        if raw_value:
            key = _normalize_menu_key(raw_value)
            if key:
                return key
    return ""


def _build_menu_item_guide() -> str:
    """Build menu item guide dynamically from catalog data."""
    catalog = _load_all_catalog_data()

    # Group menu items by normalized menu identifier (name or ID)
    menu_components = {}
    for item in catalog.menu_items:
        menu_key = _extract_menu_key(item, ("menu_id", "menu_name", "menu"))
        item_name = item.get("item_name", "").strip()

        # Skip non-food items (decorations, napkins, etc.) - only track items with prices
        if not item.get("unit_price"):
            continue

        if not menu_key:
            continue

        if menu_key not in menu_components:
            menu_components[menu_key] = []
        menu_components[menu_key].append(item_name)

    # Build guide text for each menu
    guide_lines = ["For the menuItems line, describe final quantities per component using comma-separated `항목=수량` pairs. Reflect any changes the customer requested. Use these component sets:"]

    for menu in catalog.menus:
        menu_key = _extract_menu_key(menu, ("menu_id", "name"))
        menu_name = menu.get("name", "").strip()

        if menu_key and menu_key in menu_components:
            components = ", ".join(menu_components[menu_key])
            guide_lines.append(f"- {menu_name}: {components}")

    guide_lines.append("If multiple 세트가 함께 주문되면 각 세트에 맞는 항목을 모두 포함하고, 언급되지 않은 항목은 `항목=미확인`으로 남기세요.")

    return "\n".join(guide_lines)


def _build_style_guide() -> str:
    """Provide available style names to encourage consistent menuStyle output."""
    catalog = _load_all_catalog_data()
    lines = ["Use one of these 서빙 스타일 이름(또는 null) for menuStyle:"]
    for style in catalog.styles:
        name = style.get("name", "").strip()
        if not name:
            continue
        description = style.get("description", "").strip() or "설명 없음"
        lines.append(f"- {name}: {description}")
    return "\n".join(lines)


def build_summary_prompt(history: Iterable[ChatMessage], final_message: str, assumed_date: str) -> list[dict]:
    conversation_lines = [
        f"{msg.role.upper()}: {msg.content}"
        for msg in history
    ]
    history_block = "\n".join(conversation_lines)
    menu_guide = _build_menu_item_guide()
    style_guide = _build_style_guide()

    prompt = [
        {
            "role": "system",
            "content": "\n".join(
                [
                    "You are an expert maître d' that produces structured order snapshots for Mr. Daebak Dinner.",
                    "Return plain text with the following format:",
                    "",
                    "If the customer ordered MULTIPLE menus (each with potentially different styles), use:",
                    "customerName = <value or null>",
                    "customerAddress = <value or null>",
                    "deliveryTime = <ISO 8601 datetime or null>",
                    "orderItem1.menuName = <value>",
                    "orderItem1.menuStyle = <value or null>",
                    "orderItem1.menuItems = <comma separated list of item=quantity>",
                    "orderItem1.quantity = <number>",
                    "orderItem2.menuName = <value>",
                    "orderItem2.menuStyle = <value or null>",
                    "orderItem2.menuItems = <comma separated list of item=quantity>",
                    "orderItem2.quantity = <number>",
                    "... (continue for each additional menu)",
                    "",
                    "If the customer ordered ONLY ONE menu, use the old format:",
                    "customerName = <value or null>",
                    "customerAddress = <value or null>",
                    "menuName = <value or null>",
                    "menuStyle = <value or null>",
                    "menuItems = <comma separated list of item=quantity>",
                    "deliveryTime = <ISO 8601 datetime or null>",
                    "",
                    f"Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss) for deliveryTime. Assume today is {assumed_date} and normalize any inferred delivery date to that day unless the customer explicitly requested another date.",
                    'Do not add extra lines or commentary. Use "null" (without quotes) for missing information.',
                    "When the conversation was in Korean, keep the values in Korean; otherwise mirror the customer language.",
                    menu_guide,
                    style_guide,
                ]
            ),
        },
        {
            "role": "user",
            "content": "\n".join(
                [
                    "다음은 고객과의 최종 주문 대화 내용입니다.",
                    "",
                    history_block,
                    "",
                    "최종 안내 메시지:",
                    final_message or "",
                    "",
                    "위 내용을 기준으로 주문 요약을 출력하세요. 여러 메뉴가 주문되었다면 orderItem 형식을 사용하고, 단일 메뉴라면 기존 형식을 사용하세요.",
                ]
            ),
        },
    ]
    return prompt


def parse_summary_text(raw_text: str) -> OrderSummary:
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ValueError("요약 결과가 비어있습니다.")

    values: dict[str, Any] = {key: None for key in SUMMARY_KEYS}
    order_items_dict: dict[int, dict[str, str | int]] = {}

    for line in raw_text.splitlines():
        line = line.strip()
        if not line or "=" not in line:
            continue
        key, raw_value = line.split("=", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        
        # 여러 메뉴 지원: orderItem1.menuName, orderItem2.menuStyle 등 파싱
        if key.startswith("orderItem"):
            try:
                # orderItem1.menuName 형식 파싱
                parts = key.split(".", 1)
                if len(parts) == 2:
                    item_key = parts[0]  # orderItem1
                    field_name = parts[1]  # menuName
                    
                    # orderItem1 -> 1 추출
                    item_num_str = item_key.replace("orderItem", "").strip()
                    if item_num_str:
                        item_num = int(item_num_str)
                    else:
                        item_num = 1
                    
                    # order_items_dict에 항목 추가/업데이트
                    if item_num not in order_items_dict:
                        order_items_dict[item_num] = {}
                    
                    # quantity는 int로 변환, 나머지는 str
                    if field_name == "quantity":
                        try:
                            order_items_dict[item_num][field_name] = int(raw_value) if raw_value.lower() not in {"null", "-", "none", ""} else 1
                        except ValueError:
                            order_items_dict[item_num][field_name] = 1
                    else:
                        if raw_value.lower() in {"null", "-", "none", ""}:
                            order_items_dict[item_num][field_name] = None
                        else:
                            order_items_dict[item_num][field_name] = raw_value
            except (ValueError, IndexError):
                # 파싱 실패 시 무시
                pass
        elif key in values:
            if raw_value.lower() in {"null", "-", "none", ""}:
                values[key] = None
            else:
                values[key] = raw_value

    # orderItems가 있으면 VoiceOrderItem 리스트 생성
    order_items_list = None
    if order_items_dict:
        order_items_list = []
        # item_num 순서대로 정렬
        for item_num in sorted(order_items_dict.keys()):
            item_data = order_items_dict[item_num]
            # menuName이 있는 항목만 추가
            if item_data.get("menuName"):
                try:
                    # quantity가 없으면 기본값 1 설정
                    if "quantity" not in item_data or item_data["quantity"] is None:
                        item_data["quantity"] = 1
                    # quantity가 0 이하이면 1로 설정
                    elif isinstance(item_data["quantity"], int) and item_data["quantity"] <= 0:
                        item_data["quantity"] = 1
                    
                    order_items_list.append(VoiceOrderItem(**item_data))
                except Exception as e:
                    print(f"[WARNING] VoiceOrderItem 생성 실패 (orderItem{item_num}): {e}")
                    print(f"[WARNING] item_data: {item_data}")
                    # menuName이 있으면 계속 진행
                    continue
        
        if order_items_list:
            values["orderItems"] = order_items_list

    return OrderSummary(**values)
