from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: str = Field("user", pattern="^(system|user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


class ChatResponse(BaseModel):
    message: str
    orderConfirmed: bool = False
    orderId: Optional[str] = None
    order: Optional[OrderSummary] = None


class OrderConfirmRequest(BaseModel):
    history: List[ChatMessage]
    finalMessage: Optional[str] = None


class OrderChangeRequest(OrderConfirmRequest):
    orderId: str


class VoiceOrderItem(BaseModel):
    menuName: Optional[str] = None
    menuStyle: Optional[str] = None
    menuItems: Optional[str] = None
    quantity: Optional[int] = 1


class OrderSummary(BaseModel):
    customerName: Optional[str] = None
    customerAddress: Optional[str] = None
    menuName: Optional[str] = None  # 하위 호환성 유지
    menuStyle: Optional[str] = None  # 하위 호환성 유지
    menuItems: Optional[str] = None  # 하위 호환성 유지
    deliveryTime: Optional[str] = None
    orderId: Optional[str] = None
    orderTime: Optional[str] = None
    quantity: Optional[int] = None  # 하위 호환성 유지
    # 여러 메뉴 지원
    orderItems: Optional[List[VoiceOrderItem]] = None


class OrderConfirmResponse(BaseModel):
    orderId: str
    confirmedAt: str
    order: OrderSummary
