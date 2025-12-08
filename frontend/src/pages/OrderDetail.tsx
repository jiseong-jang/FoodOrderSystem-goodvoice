import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOrderStore } from '../store/orderStore'
import { useMenuStore } from '../store/menuStore'
import { OrderStatus, UpdateOrderRequest, Item, Menu, OrderModificationLog, StyleType, MenuType } from '../types'
import { orderApi } from '../api/order'
import { menuApi } from '../api/menu'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'

const OrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const { currentOrder, loading, error, trackOrder, cancelOrder, updateOrder } = useOrderStore()
  const {} = useMenuStore()
  const [isEditing, setIsEditing] = useState(false)
  const [editedQuantities, setEditedQuantities] = useState<Record<number, Record<string, number>>>({})
  const [editedStyles, setEditedStyles] = useState<Record<number, StyleType>>({})
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [menuCache, setMenuCache] = useState<Record<number, Menu>>({})
  const [modificationLogs, setModificationLogs] = useState<OrderModificationLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [allItems, setAllItems] = useState<Item[]>([])
  const [loadingItems, setLoadingItems] = useState(false)

  useEffect(() => {
    if (id) {
      trackOrder(parseInt(id))
      fetchModificationLogs(parseInt(id))
    }
  }, [id, trackOrder])

  useEffect(() => {
    const fetchAllItems = async () => {
      setLoadingItems(true)
      try {
        const response = await menuApi.getAllItems()
        if (response.success && response.data) {
          setAllItems(response.data)
        }
      } catch (err) {
        console.error('아이템 목록 조회 실패:', err)
      } finally {
        setLoadingItems(false)
      }
    }
    fetchAllItems()
  }, [])

  const fetchModificationLogs = async (orderId: number) => {
    try {
      setLoadingLogs(true)
      const response = await orderApi.getModificationLogs(orderId)
      if (response.success && response.data) {
        setModificationLogs(response.data)
      }
    } catch (err: any) {
      console.error('수정 로그 조회 실패:', err)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (currentOrder && isEditing) {
      // 각 주문 아이템의 메뉴 정보를 가져오기 (편집 모드 진입 시 항상 다시 로드)
      const loadMenus = async () => {
        const cache: Record<number, Menu> = {}
        // 중복된 메뉴 ID를 제거하여 효율적으로 로드
        const uniqueMenuIds = [...new Set(currentOrder.orderItems.map(item => item.menu.id))]
        
        for (const menuId of uniqueMenuIds) {
          try {
            // 편집 모드 진입 시 항상 메뉴를 다시 가져옴
            const response = await menuApi.getMenuById(menuId)
            if (response.success && response.data) {
              cache[menuId] = response.data
            }
          } catch (error) {
            console.error(`메뉴 ${menuId} 로드 실패:`, error)
          }
        }
        if (Object.keys(cache).length > 0) {
          setMenuCache(cache) // 기존 캐시를 완전히 교체
        }
      }
      loadMenus()
    } else if (!isEditing) {
      // 편집 모드가 아닐 때는 메뉴 캐시를 초기화하지 않음 (필요 시 재사용)
    }
  }, [currentOrder, isEditing])

  useEffect(() => {
    if (currentOrder && isEditing) {
      // 편집 모드 진입 시 항상 현재 최신 주문 아이템의 수량으로 완전히 초기화
      // 주문 수정 후 OrderItem ID가 바뀔 수 있으므로 매번 완전히 새로 초기화
      const initialQuantities: Record<number, Record<string, number>> = {}
      const initialStyles: Record<number, StyleType> = {}
      // 현재 주문의 OrderItem만 사용 (최신 데이터만)
      currentOrder.orderItems.forEach(item => {
        // 항상 최신 customizedQuantities를 깊은 복사하여 초기화
        initialQuantities[item.id] = JSON.parse(JSON.stringify(item.customizedQuantities || {}))
        // 현재 스타일로 초기화
        initialStyles[item.id] = item.styleType
      })
      // 기존 editedQuantities 완전히 무시하고 새로 초기화
      setEditedQuantities(initialQuantities)
      setEditedStyles(initialStyles)
    } else if (!isEditing) {
      // 편집 모드가 아닐 때는 editedQuantities와 editedStyles 완전히 초기화
      setEditedQuantities({})
      setEditedStyles({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrder?.orderId, isEditing])

  const getStatusName = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.RECEIVED: return '접수 완료'
      case OrderStatus.COOKING: return '조리 중'
      case OrderStatus.DELIVERING: return '배달 중'
      case OrderStatus.COMPLETED: return '배달 완료'
      case OrderStatus.CANCELLED: return '취소됨'
      case OrderStatus.REJECTED: return '주방 거절'
      default: return status
    }
  }

  const getItemLabel = (code: string): string => {
    const labelMap: Record<string, string> = {
      'STEAK': '스테이크',
      'WINE_BOTTLE': '와인(병)',
      'CHAMPAGNE': '샴페인',
      'WINE_GLASS': '와인(잔)',
      'COFFEE': '커피',
      'SALAD': '샐러드',
      'EGG_SCRAMBLE': '에그 스크램블',
      'BACON': '베이컨',
      'BREAD': '빵',
      'BAGUETTE': '바게트빵',
      'COFFEE_POT': '커피 포트'
    }
    return labelMap[code] || code
  }

  const getMenuName = (type: string) => {
    const menuMap: Record<string, string> = {
      'VALENTINE': '발렌타인 디너',
      'FRENCH': '프렌치 디너',
      'ENGLISH': '잉글리시 디너',
      'CHAMPAGNE_FESTIVAL': '샴페인 축제 디너'
    }
    return menuMap[type] || type
  }

  const calculateItemPrice = (item: any, menu: Menu | null) => {
    if (!menu) return item.subTotal

    // 편집 모드일 때는 editedStyles 사용, 아닐 때는 item.styleType 사용
    const currentStyleType = isEditing 
      ? (editedStyles[item.id] || item.styleType)
      : item.styleType

    let stylePrice = 0
    if (currentStyleType === StyleType.GRAND) stylePrice = 10000
    else if (currentStyleType === StyleType.DELUXE) stylePrice = 20000

    let customizationPrice = 0
    // 편집 모드일 때만 editedQuantities 사용, 아닐 때는 항상 item.customizedQuantities 사용
    const quantities = isEditing 
      ? (editedQuantities[item.id] || item.customizedQuantities || {})
      : (item.customizedQuantities || {})
    
    // customizedQuantities의 모든 항목을 순회하여 가격 계산 (메뉴에 없는 아이템 포함)
    Object.entries(quantities).forEach(([code, qty]) => {
      if (typeof qty === 'number' && qty > 0) {
        const itemInfo = allItems.find(i => i.code === code)
        if (itemInfo) {
          const menuItem = menu.items.find(i => i.code === code)
          // 메뉴에 있는 아이템: 기본 수량과 비교하여 차이만 가격 계산
          // 메뉴에 없는 아이템: 기본 수량은 0이므로 전체 수량만큼 가격 계산
          const defaultQty = menuItem ? (menuItem.defaultQuantity ?? 1) : 0
          customizationPrice += (qty - defaultQty) * itemInfo.unitPrice
        }
      }
    })

    return (menu.basePrice + stylePrice + customizationPrice) * item.quantity
  }

  const calculateTotalPrice = () => {
    if (!currentOrder || !currentOrder.orderItems || currentOrder.orderItems.length === 0) return 0
    
    // 중복 제거: 메뉴 ID별로 가장 최신 아이템(ID가 가장 큰 것)만 계산
    // 주문 수정 후 변경 전과 변경 후가 모두 있을 수 있으므로 중복 제거 필수
    const itemsByMenuId = new Map<number, any>()
    
    currentOrder.orderItems.forEach((item) => {
      const menuId = item.menu.id
      const existing = itemsByMenuId.get(menuId)
      
      if (!existing || item.id > existing.id) {
        // 같은 메뉴 ID가 없거나, 더 최신 ID면 저장/교체
        itemsByMenuId.set(menuId, item)
      }
    })
    
    // Map에서 배열로 변환 (최신 것만 포함)하여 가격 계산
    const uniqueItems = Array.from(itemsByMenuId.values())
    let total = 0
    uniqueItems.forEach(item => {
      const menu = menuCache[item.menu.id]
      // 편집 모드일 때는 편집 중인 스타일과 수량을 사용하여 가격 계산
      total += calculateItemPrice(item, menu)
    })
    return total
  }

  const handleQuantityChange = (itemId: number, itemCode: string, delta: number) => {
    if (!currentOrder) return
    
    // 현재 OrderItem 찾기
    const currentItem = currentOrder.orderItems.find(item => item.id === itemId)
    if (!currentItem) return
    
    setEditedQuantities(prev => {
      // 현재 OrderItem의 customizedQuantities를 기준으로 가져오기
      const baseQuantities = currentItem.customizedQuantities || {}
      const current = prev[itemId] || baseQuantities
      const currentQty = current[itemCode] ?? baseQuantities[itemCode] ?? 0
      const nextQty = Math.max(0, currentQty + delta)
      return {
        ...prev,
        [itemId]: {
          ...baseQuantities,
          ...current,
          [itemCode]: nextQty
        }
      }
    })
  }

  const handleUpdateOrder = async () => {
    if (!currentOrder) return

    // 편집된 총 금액 계산 (중복 제거 로직이 이미 적용됨)
    const editedTotalPrice = calculateTotalPrice()
    // 쿠폰이 적용되어 있다면 할인 금액 고려
    const discountAmount = currentOrder.coupon ? currentOrder.coupon.discountAmount : 0
    const editedFinalPrice = Math.max(0, editedTotalPrice - discountAmount)
    
    // 편집 전 상태의 가격 계산 (중복 제거 후 각 항목의 subTotal만 합산)
    // 메뉴 ID별로 가장 최신 아이템만 선택
    const itemsByMenuId = new Map<number, any>()
    currentOrder.orderItems.forEach((item) => {
      const menuId = item.menu.id
      const existing = itemsByMenuId.get(menuId)
      if (!existing || item.id > existing.id) {
        itemsByMenuId.set(menuId, item)
      }
    })
    const currentTotalPrice = Array.from(itemsByMenuId.values()).reduce((sum, item) => sum + item.subTotal, 0)
    const currentFinalPrice = Math.max(0, currentTotalPrice - discountAmount)
    
    // 가격 차이 계산 (편집 후 최종 가격 - 현재 최종 가격)
    const priceDiff = editedFinalPrice - currentFinalPrice
    const confirmMessage = priceDiff > 0
      ? `주문 수정 시 추가 결제 ${priceDiff.toLocaleString()}원이 필요합니다. 계속하시겠습니까?`
      : priceDiff < 0
      ? `주문 수정 시 ${Math.abs(priceDiff).toLocaleString()}원이 환불됩니다. 계속하시겠습니까?`
      : '주문을 수정하시겠습니까?'

    if (!window.confirm(confirmMessage)) return

    setUpdating(true)
    setUpdateError('')

    try {
      const updateRequest: UpdateOrderRequest = {
        orderItems: currentOrder.orderItems.map(item => {
          // 편집 모드에서 수정된 수량 사용, 없으면 현재 customizedQuantities 사용
          const quantities = editedQuantities[item.id] || item.customizedQuantities || {}
          // 편집 모드에서 수정된 스타일 사용, 없으면 현재 styleType 사용
          const styleType = editedStyles[item.id] || item.styleType
          return {
            menuId: item.menu.id,
            styleType: styleType,
            customizedQuantities: quantities,
            quantity: item.quantity
          }
        })
      }

      // updateOrder가 최신 주문 정보를 반환하고 orderStore에서 currentOrder 업데이트
      await updateOrder(currentOrder.orderId, updateRequest)
      
      // 편집 모드 즉시 종료하여 모든 편집 상태 초기화
      setIsEditing(false)
      setEditedQuantities({}) // 편집 수량 완전 초기화
      setEditedStyles({}) // 편집 스타일 완전 초기화
      setMenuCache({}) // 메뉴 캐시 초기화
      
      // 주문 정보를 서버에서 다시 가져와서 확실하게 최신 데이터 사용
      if (id) {
        // 주문 정보를 먼저 가져온 후 수정 로그 가져오기
        // 약간의 딜레이를 주어 서버에서 완전히 업데이트된 후 데이터를 가져오도록 함
        await new Promise(resolve => setTimeout(resolve, 300))
        await trackOrder(parseInt(id))
        await fetchModificationLogs(parseInt(id))
      }
      
      alert('주문이 수정되었습니다. (환불 및 재결제 완료)')
    } catch (e: any) {
      setUpdateError(e?.message || '주문 수정에 실패했습니다.')
    } finally {
      setUpdating(false)
    }
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!currentOrder) return <div>주문을 찾을 수 없습니다</div>

  const canEdit = currentOrder.status === OrderStatus.RECEIVED
  
  // 최종 가격 계산: 수정 후 아이템(ID가 가장 큰 것)만으로 계산
  const discountAmount = currentOrder.coupon ? currentOrder.coupon.discountAmount : 0
  
  // 수정 후 아이템만 선택하여 가격 계산 (메뉴 ID별로 가장 최신 아이템만)
  const getFinalPrice = () => {
    if (!currentOrder || !currentOrder.orderItems || currentOrder.orderItems.length === 0) return currentOrder.finalPrice
    
    // 메뉴 ID별로 가장 최신 아이템(ID가 가장 큰 것)만 선택
    const itemsByMenuId = new Map<number, any>()
    currentOrder.orderItems.forEach((item) => {
      const menuId = item.menu.id
      const existing = itemsByMenuId.get(menuId)
      if (!existing || item.id > existing.id) {
        itemsByMenuId.set(menuId, item)
      }
    })
    
    // 수정 후 아이템들의 subTotal만 합산
    const totalPrice = Array.from(itemsByMenuId.values()).reduce((sum, item) => sum + item.subTotal, 0)
    return Math.max(0, totalPrice - discountAmount)
  }
  
  const currentFinalPrice = getFinalPrice()
  
  // 편집 모드일 때만 편집된 가격 계산
  const editedTotalPrice = isEditing ? calculateTotalPrice() : 0
  const editedFinalPrice = isEditing ? Math.max(0, editedTotalPrice - discountAmount) : currentFinalPrice
  const priceDiff = isEditing ? editedFinalPrice - currentFinalPrice : 0


  return (
    <div style={{ padding: '3rem 2rem', maxWidth: '900px', margin: '0 auto', minHeight: 'calc(100vh - 200px)' }}>
      <h2 style={{ 
        marginBottom: '2.5rem',
        fontSize: '2.5rem',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
        fontWeight: '800',
        letterSpacing: '-1px'
      }}>
        주문 상세
      </h2>
      <div style={{ 
        border: '1px solid #e2e8f0', 
        borderRadius: '1rem', 
        padding: '2rem', 
        marginBottom: '2rem',
        background: 'white',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      }}>
        <h3 style={{ 
          marginBottom: '1rem',
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b'
        }}>주문 #{currentOrder.orderId}</h3>
        <p style={{ marginBottom: '0.5rem', color: '#64748b' }}>
          상태: <strong style={{ color: '#1e293b' }}>{getStatusName(currentOrder.status)}</strong>
        </p>
        <p style={{ marginBottom: '0.5rem', color: '#64748b' }}>
          주문일: {new Date(currentOrder.createdAt).toLocaleString()}
        </p>
        {currentOrder.coupon && (
          <div style={{ 
            marginBottom: '0.5rem', 
            padding: '0.75rem', 
            background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            borderRadius: '0.5rem',
            border: '1px solid #bae6fd'
          }}>
            <p style={{ margin: 0, color: '#0369a1', fontWeight: '600' }}>
              쿠폰 적용: {currentOrder.coupon.code} (-{currentOrder.coupon.discountAmount.toLocaleString()}원)
            </p>
          </div>
        )}
        <p style={{ 
          marginTop: '1rem',
          fontSize: '1.5rem', 
          fontWeight: 'bold',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}>
          최종 가격: <strong style={{ fontSize: '1.75rem' }}>{currentFinalPrice.toLocaleString()}원</strong>
        </p>
        {isEditing && priceDiff !== 0 && (
          <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fff3cd', borderRadius: '4px' }}>
            <p style={{ color: priceDiff > 0 ? '#dc3545' : '#28a745', margin: 0 }}>
              {priceDiff > 0 ? `추가 결제: +${priceDiff.toLocaleString()}원` : `환불: ${priceDiff.toLocaleString()}원`}
            </p>
          </div>
        )}
        {canEdit && !isEditing && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                // 편집 모드 진입 전 editedQuantities와 editedStyles 완전 초기화
                setEditedQuantities({})
                setEditedStyles({})
                setIsEditing(true)
              }}
              style={{ 
                padding: '0.75rem 1.5rem', 
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white', 
                border: 'none', 
                borderRadius: '0.5rem', 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.25s ease',
                boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(59, 130, 246, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(59, 130, 246, 0.3)'
              }}
            >
              주문 수정
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('이 주문을 취소하시겠습니까?')) return
                try {
                  await cancelOrder(currentOrder.orderId)
                  alert('주문이 취소되었습니다.')
                } catch (e: any) {
                  alert(e?.message || '주문 취소에 실패했습니다.')
                }
              }}
              style={{ 
                padding: '0.75rem 1.5rem', 
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: 'white', 
                border: 'none', 
                borderRadius: '0.5rem', 
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.25s ease',
                boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)'
                e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(239, 68, 68, 0.4)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(239, 68, 68, 0.3)'
              }}
            >
              주문 취소
            </button>
          </div>
        )}
        {isEditing && (
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleUpdateOrder}
              disabled={updating}
              style={{ padding: '0.5rem 1rem', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '4px', cursor: updating ? 'not-allowed' : 'pointer', opacity: updating ? 0.6 : 1 }}
            >
              {updating ? '수정 중...' : '수정 완료 (환불 및 재결제)'}
            </button>
            <button
              onClick={() => {
                setIsEditing(false)
                setUpdateError('')
                setEditedQuantities({}) // 편집 취소 시 editedQuantities 완전 초기화
                setEditedStyles({}) // 편집 취소 시 editedStyles 완전 초기화
              }}
              disabled={updating}
              style={{ padding: '0.5rem 1rem', backgroundColor: '#6c757d', color: 'white', border: 'none', borderRadius: '4px', cursor: updating ? 'not-allowed' : 'pointer' }}
            >
              취소
            </button>
          </div>
        )}
        {updateError && (
          <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#f8d7da', color: '#721c24', borderRadius: '4px' }}>
            {updateError}
          </div>
        )}
      </div>

      {/* 주문 메뉴 섹션 - 항상 최신 메뉴 구성만 표시 */}
      <div style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>주문 메뉴 (최신)</h3>
        {/* 항상 현재 주문의 최신 아이템만 표시 - 수정 로그나 변경 전 내용 절대 표시하지 않음 */}
        {currentOrder && currentOrder.orderItems && currentOrder.orderItems.length > 0 ? (() => {
          // 중복 제거: 주문 수정 시 새 아이템이 생성되므로 ID가 가장 큰 것이 최신
          // 메뉴 ID별로 가장 최신 아이템(ID가 가장 큰 것)만 표시
          const itemsByMenuId = new Map<number, any>()
          
          currentOrder.orderItems.forEach((item) => {
            const menuId = item.menu.id
            const existing = itemsByMenuId.get(menuId)
            
            if (!existing || item.id > existing.id) {
              // 같은 메뉴 ID가 없거나, 더 최신 ID면 저장/교체
              itemsByMenuId.set(menuId, item)
            }
          })
          
          // Map에서 배열로 변환 (각 메뉴별로 가장 최신 것만 포함)
          const finalItems = Array.from(itemsByMenuId.values()).sort((a, b) => b.id - a.id)
          
          return finalItems.map((item, index) => {
            const menu = menuCache[item.menu.id]
            
            // 편집 모드일 때만 editedQuantities 사용, 아닐 때는 항상 최신 item.customizedQuantities 사용
            // 수정 로그나 이전 데이터는 절대 참조하지 않음
            const quantities = isEditing 
              ? (editedQuantities[item.id] || item.customizedQuantities || {}) 
              : (item.customizedQuantities || {})
            
            // 편집 모드가 아닐 때는 서버에서 받은 subTotal을 직접 사용 (중복 계산 방지)
            const itemPrice = isEditing 
              ? calculateItemPrice(item, menu) 
              : item.subTotal

            return (
              <div key={`order-item-${currentOrder.orderId}-${item.id}-${index}`} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '0.75rem', 
              padding: '1.5rem', 
              marginBottom: '1rem',
              background: 'white',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <div>
                  <p style={{ marginBottom: '0.5rem', fontSize: '1.125rem' }}>
                    <strong>{getMenuName(item.menu.type)}</strong> - {isEditing ? (editedStyles[item.id] || item.styleType) : item.styleType}
                  </p>
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>수량: {item.quantity}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ 
                    fontSize: '1.5rem', 
                    fontWeight: 'bold', 
                    color: '#007bff',
                    margin: 0
                  }}>
                    {itemPrice.toLocaleString()}원
                  </p>
                </div>
              </div>
              {isEditing && menu && (
                <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <h4 style={{ marginBottom: '0.75rem', fontSize: '1rem', fontWeight: '600', color: '#1e293b' }}>스타일 선택</h4>
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${(editedStyles[item.id] || item.styleType) === StyleType.SIMPLE ? '#667eea' : '#e2e8f0'}`,
                      borderRadius: '0.5rem',
                      background: (editedStyles[item.id] || item.styleType) === StyleType.SIMPLE ? 'rgba(102, 126, 234, 0.1)' : 'white',
                      cursor: menu.type === MenuType.CHAMPAGNE_FESTIVAL ? 'not-allowed' : 'pointer',
                      opacity: menu.type === MenuType.CHAMPAGNE_FESTIVAL ? 0.5 : 1,
                      transition: 'all 0.25s ease',
                      fontWeight: '500',
                      fontSize: '0.9rem'
                    }}>
                      <input
                        type="radio"
                        name={`style-${item.id}`}
                        value={StyleType.SIMPLE}
                        checked={(editedStyles[item.id] || item.styleType) === StyleType.SIMPLE}
                        onChange={(e) => setEditedStyles(prev => ({ ...prev, [item.id]: e.target.value as StyleType }))}
                        disabled={menu.type === MenuType.CHAMPAGNE_FESTIVAL}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      심플 (+0원)
                    </label>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${(editedStyles[item.id] || item.styleType) === StyleType.GRAND ? '#667eea' : '#e2e8f0'}`,
                      borderRadius: '0.5rem',
                      background: (editedStyles[item.id] || item.styleType) === StyleType.GRAND ? 'rgba(102, 126, 234, 0.1)' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      fontWeight: '500',
                      fontSize: '0.9rem'
                    }}>
                      <input
                        type="radio"
                        name={`style-${item.id}`}
                        value={StyleType.GRAND}
                        checked={(editedStyles[item.id] || item.styleType) === StyleType.GRAND}
                        onChange={(e) => setEditedStyles(prev => ({ ...prev, [item.id]: e.target.value as StyleType }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      그랜드 (+10,000원)
                    </label>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem',
                      padding: '0.75rem 1rem',
                      border: `2px solid ${(editedStyles[item.id] || item.styleType) === StyleType.DELUXE ? '#667eea' : '#e2e8f0'}`,
                      borderRadius: '0.5rem',
                      background: (editedStyles[item.id] || item.styleType) === StyleType.DELUXE ? 'rgba(102, 126, 234, 0.1)' : 'white',
                      cursor: 'pointer',
                      transition: 'all 0.25s ease',
                      fontWeight: '500',
                      fontSize: '0.9rem'
                    }}>
                      <input
                        type="radio"
                        name={`style-${item.id}`}
                        value={StyleType.DELUXE}
                        checked={(editedStyles[item.id] || item.styleType) === StyleType.DELUXE}
                        onChange={(e) => setEditedStyles(prev => ({ ...prev, [item.id]: e.target.value as StyleType }))}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      디럭스 (+20,000원)
                    </label>
                  </div>
                  {menu.type === MenuType.CHAMPAGNE_FESTIVAL && (editedStyles[item.id] || item.styleType) === StyleType.SIMPLE && (
                    <p style={{ 
                      color: '#ef4444', 
                      fontSize: '0.85rem',
                      marginTop: '0.5rem',
                      padding: '0.5rem',
                      background: '#fef2f2',
                      borderRadius: '0.375rem',
                      border: '1px solid #fecaca',
                      fontWeight: '500'
                    }}>
                      샴페인 축제 디너는 그랜드 또는 디럭스 스타일만 선택 가능합니다
                    </p>
                  )}
                </div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <strong>구성 음식:</strong>
                {isEditing && menu ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    {/* 메뉴에 포함된 아이템 먼저 표시 */}
                    {menu.items.map((menuItem: Item) => {
                      const qty = quantities[menuItem.code] ?? menuItem.defaultQuantity ?? 0
                      const defaultQty = menuItem.defaultQuantity ?? 1
                      return (
                        <div key={menuItem.code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                          <span style={{ minWidth: '120px' }}>
                            {getItemLabel(menuItem.code)}
                            {qty !== defaultQty && (
                              <span style={{ marginLeft: '0.5rem', color: '#667eea', fontSize: '0.85rem' }}>
                                (기본: {defaultQty}개)
                              </span>
                            )}
                          </span>
                          <button
                            onClick={() => handleQuantityChange(item.id, menuItem.code, -1)}
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <span style={{ minWidth: '30px', textAlign: 'center' }}>{qty}</span>
                          <button
                            onClick={() => handleQuantityChange(item.id, menuItem.code, 1)}
                            style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                      )
                    })}
                    {/* 메뉴에 없는 추가 아이템 표시 */}
                    {Object.entries(quantities)
                      .filter(([code]) => !menu.items.find(item => item.code === code))
                      .filter(([, qty]) => typeof qty === 'number' && qty > 0)
                      .map(([code, qty]) => {
                        const itemInfo = allItems.find(i => i.code === code)
                        if (!itemInfo) return null
                        return (
                          <div key={code} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem', 
                            marginBottom: '0.25rem',
                            padding: '0.5rem',
                            background: 'rgba(102, 126, 234, 0.05)',
                            borderRadius: '0.25rem',
                            border: '1px solid rgba(102, 126, 234, 0.2)'
                          }}>
                            <span style={{ minWidth: '120px' }}>
                              {getItemLabel(code)}
                              <span style={{ marginLeft: '0.5rem', color: '#667eea', fontSize: '0.85rem', fontWeight: '600' }}>
                                (추가 음식)
                              </span>
                            </span>
                            <button
                              onClick={() => handleQuantityChange(item.id, code, -1)}
                              style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                            >
                              -
                            </button>
                            <span style={{ minWidth: '30px', textAlign: 'center' }}>{qty as number}</span>
                            <button
                              onClick={() => handleQuantityChange(item.id, code, 1)}
                              style={{ padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                            >
                              +
                            </button>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#555' }}>
                    {/* 편집 모드가 아닐 때는 최신 customizedQuantities 표시, 없으면 메뉴 기본 구성품 표시 */}
                    {(() => {
                      const quantities = item.customizedQuantities || {}
                      const hasCustomized = Object.keys(quantities).length > 0
                      
                      if (hasCustomized) {
                        // customizedQuantities가 있으면 표시
                        return Object.entries(quantities)
                          .filter(([, qty]) => typeof qty === 'number' && qty > 0)
                          .map(([code, qty], index) => (
                            <span key={code}>
                              {index > 0 && ', '}
                              {getItemLabel(code)} x {qty as number}
                            </span>
                          ))
                      } else if (menu) {
                        // customizedQuantities가 없으면 메뉴의 기본 구성품 표시
                        return menu.items
                          .filter(item => (item.defaultQuantity || 0) > 0)
                          .map((menuItem, index) => (
                            <span key={menuItem.code}>
                              {index > 0 && ', '}
                              {getItemLabel(menuItem.code)} x {menuItem.defaultQuantity || 1}
                            </span>
                          ))
                      } else {
                        // 메뉴 정보도 없으면 빈 메시지
                        return <span style={{ color: '#94a3b8' }}>구성품 정보 없음</span>
                      }
                    })()}
                  </div>
                )}
              </div>
              </div>
            )
          })
        })() : (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            주문 메뉴가 없습니다.
          </div>
        )}
      </div>

      {/* 주문 수정 이력 섹션 - 아래에 별도로 표시 */}
      {modificationLogs.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>주문 수정 이력</h3>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            border: '1px solid #e2e8f0'
          }}>
            {loadingLogs ? (
              <LoadingSpinner />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {modificationLogs.map((log, index) => {
                  let previousItems: any[] = []
                  let newItems: any[] = []
                  try {
                    previousItems = JSON.parse(log.previousOrderItems || '[]')
                    newItems = JSON.parse(log.newOrderItems || '[]')
                  } catch (e) {
                    console.error('JSON 파싱 오류:', e)
                  }

                  return (
                    <div key={log.id} style={{
                      padding: '1.5rem',
                      border: '1px solid #e2e8f0',
                      borderRadius: '0.75rem',
                      background: '#f8fafc'
                    }}>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1e293b' }}>
                          수정 #{modificationLogs.length - index}
                        </div>
                        <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                          {new Date(log.modifiedAt).toLocaleString('ko-KR')}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {(() => {
                          // 변경 후 항목들 중복 제거: 같은 메뉴 ID와 스타일 타입의 경우 가장 최신 것만 표시
                          const uniqueNewItemsMap = new Map<string, any>()
                          newItems.forEach((newItem: any) => {
                            const key = `${newItem.menuId}-${newItem.styleType}`
                            const existing = uniqueNewItemsMap.get(key)
                            // 인덱스나 ID가 더 큰 것(더 최신)을 사용
                            if (!existing || (newItem.itemId || 0) > (existing.itemId || 0)) {
                              uniqueNewItemsMap.set(key, newItem)
                            }
                          })
                          const uniqueNewItems = Array.from(uniqueNewItemsMap.values())
                          
                          // 변경 전 항목들도 중복 제거
                          const uniquePreviousItemsMap = new Map<string, any>()
                          previousItems.forEach((prevItem: any, idx: number) => {
                            const key = `${prevItem.menuId || prevItem.menu?.id}-${prevItem.styleType}`
                            const existing = uniquePreviousItemsMap.get(key)
                            if (!existing || idx > (existing.idx || -1)) {
                              uniquePreviousItemsMap.set(key, { ...prevItem, idx })
                            }
                          })
                          const uniquePreviousItems = Array.from(uniquePreviousItemsMap.values())
                          
                          // 매칭하여 표시
                          return uniqueNewItems.map((newItem: any, idx: number) => {
                            // 변경 후 항목과 매칭되는 변경 전 항목 찾기 (메뉴 ID만으로 매칭하여 스타일 변경도 감지)
                            const prevItem = uniquePreviousItems.find((p: any) => {
                              const prevMenuId = p.menuId || p.menu?.id
                              return prevMenuId === newItem.menuId
                            }) || uniquePreviousItems[idx]
                            
                            if (!prevItem) return null
                            
                            const prevQuantities = prevItem.customizedQuantities || {}
                            const newQuantities = newItem.customizedQuantities || {}
                            const prevStyleType = prevItem.styleType || prevItem.styleType
                            const newStyleType = newItem.styleType
                            
                            // 스타일 변경 확인
                            const styleChanged = prevStyleType !== newStyleType
                            
                            // 모든 구성 음식 코드 수집 (변경 전/후 모두)
                            const allCodes = new Set([
                              ...Object.keys(prevQuantities),
                              ...Object.keys(newQuantities)
                            ])
                            
                            // 변경된 구성 음식만 필터링
                            const changedItems: Array<{code: string, prev: number, new: number}> = []
                            allCodes.forEach(code => {
                              const prevQty = prevQuantities[code] || 0
                              const newQty = newQuantities[code] || 0
                              if (prevQty !== newQty) {
                                changedItems.push({ code, prev: prevQty, new: newQty })
                              }
                            })
                            
                            return (
                            <div key={idx} style={{
                              border: '1px solid #e2e8f0',
                              borderRadius: '0.5rem',
                              padding: '1rem',
                              background: 'white'
                            }}>
                              <div style={{ 
                                fontWeight: '600', 
                                marginBottom: '0.75rem', 
                                color: '#1e293b',
                                fontSize: '0.95rem'
                              }}>
                                {getMenuName(prevItem.menuType || prevItem.menu?.type)}
                                {styleChanged && (
                                  <span style={{ marginLeft: '0.5rem', color: '#0369a1' }}>
                                    (스타일 변경: {prevStyleType} → {newStyleType})
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.875rem' }}>
                                <div>
                                  <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>변경 전</div>
                                  <div style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                                    가격: {prevItem.subTotal.toLocaleString()}원
                                  </div>
                                  {Object.keys(prevQuantities).length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {Object.entries(prevQuantities)
                                        .filter(([, qty]) => typeof qty === 'number' && qty > 0)
                                        .map(([code, qty]) => (
                                          <div key={code} style={{ color: '#1e293b' }}>
                                            {getItemLabel(code)}: {qty as number}개
                                          </div>
                                        ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>구성 음식 없음</div>
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#64748b' }}>변경 후</div>
                                  <div style={{ color: '#1e293b', marginBottom: '0.5rem' }}>
                                    가격: {newItem.subTotal.toLocaleString()}원
                                  </div>
                                  {Object.keys(newQuantities).length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                      {Object.entries(newQuantities)
                                        .filter(([, qty]) => typeof qty === 'number' && qty > 0)
                                        .map(([code, qty]) => (
                                          <div key={code} style={{ color: '#1e293b' }}>
                                            {getItemLabel(code)}: {qty as number}개
                                          </div>
                                        ))}
                                    </div>
                                  ) : (
                                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>구성 음식 없음</div>
                                  )}
                                </div>
                              </div>
                              {(styleChanged || changedItems.length > 0) && (
                                <div style={{ 
                                  marginTop: '1rem', 
                                  padding: '0.75rem',
                                  background: '#f0f9ff',
                                  borderRadius: '0.5rem',
                                  border: '1px solid #bae6fd'
                                }}>
                                  {styleChanged && (
                                    <div style={{ marginBottom: changedItems.length > 0 ? '0.75rem' : '0', paddingBottom: changedItems.length > 0 ? '0.75rem' : '0', borderBottom: changedItems.length > 0 ? '1px solid #bae6fd' : 'none' }}>
                                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#0369a1', fontSize: '0.875rem' }}>
                                        스타일 변경:
                                      </div>
                                      <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                        <span style={{ fontWeight: '600' }}>{prevStyleType}</span> → <span style={{ fontWeight: '600', color: '#0369a1' }}>{newStyleType}</span>
                                      </div>
                                    </div>
                                  )}
                                  {changedItems.length > 0 && (
                                    <>
                                      <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#0369a1', fontSize: '0.875rem' }}>
                                        구성 음식 수량 변경:
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
                                        {changedItems.map(({ code, prev, new: newQty }) => (
                                          <div key={code} style={{ color: '#1e293b' }}>
                                            <span style={{ fontWeight: '600' }}>{getItemLabel(code)}</span>:{' '}
                                            <span style={{ color: prev < newQty ? '#dc3545' : '#28a745' }}>
                                              {prev}개 → {newQty}개
                                            </span>
                                            {prev < newQty && (
                                              <span style={{ color: '#dc3545', marginLeft: '0.5rem' }}>
                                                (+{newQty - prev}개)
                                              </span>
                                            )}
                                            {prev > newQty && (
                                              <span style={{ color: '#28a745', marginLeft: '0.5rem' }}>
                                                ({newQty - prev}개)
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default OrderDetail
