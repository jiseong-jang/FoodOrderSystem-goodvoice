import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCartStore } from '../store/cartStore'
import { StyleType, MenuType, CustomerCoupon, Item } from '../types'
import { customerApi } from '../api/customer'
import { menuApi } from '../api/menu'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'

const Cart = () => {
  const { cart, loading, error, fetchCart, updateItem, removeItem } = useCartStore()
  const [availableCoupons, setAvailableCoupons] = useState<CustomerCoupon[]>([])
  const [selectedCoupon, setSelectedCoupon] = useState<CustomerCoupon | null>(null)
  const [loadingCoupons, setLoadingCoupons] = useState(false)
  const [allItems, setAllItems] = useState<Item[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchCart()
    fetchAvailableCoupons()
    fetchAllItems()
  }, [fetchCart])

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

  const fetchAvailableCoupons = async () => {
    try {
      setLoadingCoupons(true)
      const response = await customerApi.getCoupons()
      if (response.success && response.data) {
        // 사용하지 않은 쿠폰만 필터링
        const unused = response.data.filter(c => !c.isUsed)
        setAvailableCoupons(unused)
      }
    } catch (err: any) {
      console.error('쿠폰 목록 조회 실패:', err)
    } finally {
      setLoadingCoupons(false)
    }
  }

  const getMenuName = (type: MenuType) => {
    switch (type) {
      case MenuType.VALENTINE: return '발렌타인 디너'
      case MenuType.FRENCH: return '프렌치 디너'
      case MenuType.ENGLISH: return '잉글리시 디너'
      case MenuType.CHAMPAGNE_FESTIVAL: return '샴페인 축제 디너'
      default: return type
    }
  }

  const getStyleName = (style: StyleType) => {
    switch (style) {
      case StyleType.SIMPLE: return '심플'
      case StyleType.GRAND: return '그랜드'
      case StyleType.DELUXE: return '디럭스'
      default: return style
    }
  }

  const handleSelectCoupon = (customerCoupon: CustomerCoupon) => {
    setSelectedCoupon(customerCoupon)
  }

  const handleRemoveCoupon = () => {
    setSelectedCoupon(null)
  }

  const calculateFinalPrice = () => {
    if (!cart) return 0
    const totalPrice = cart.totalPrice
    if (selectedCoupon) {
      return Math.max(0, totalPrice - selectedCoupon.coupon.discountAmount)
    }
    return totalPrice
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />
  if (!cart || cart.items.length === 0) {
    return (
      <div style={{ 
        minHeight: 'calc(100vh - 200px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <div style={{
          padding: '3rem',
          background: 'white',
          borderRadius: '1rem',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}>
          <h2 style={{ 
            marginBottom: '1rem',
            fontSize: '2rem',
            color: '#1e293b'
          }}>
            장바구니가 비어있습니다
          </h2>
          <button 
            onClick={() => navigate('/menu')} 
            style={{ 
              marginTop: '1.5rem', 
              padding: '1rem 2.5rem', 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white', 
              border: 'none', 
              borderRadius: '0.75rem', 
              cursor: 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              boxShadow: '0 10px 15px -3px rgba(102, 126, 234, 0.3)',
              transition: 'all 0.25s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(102, 126, 234, 0.4)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(102, 126, 234, 0.3)'
            }}
          >
            메뉴 보기
          </button>
        </div>
      </div>
    )
  }

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
        장바구니
      </h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
        {cart.items.map((item) => (
          <div 
            key={item.id} 
            style={{ 
              background: 'white',
              borderRadius: '1rem', 
              padding: '1.5rem',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              border: '1px solid #e2e8f0',
              transition: 'all 0.25s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
          >
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              marginBottom: '1rem',
              paddingBottom: '1rem',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  fontWeight: '600',
                  minWidth: '60px'
                }}>
                  메뉴:
                </span>
                <span style={{
                  fontSize: '1.25rem',
                  fontWeight: '700',
                  color: '#1e293b'
                }}>
                  {getMenuName(item.menu.type)}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  fontWeight: '600',
                  minWidth: '60px'
                }}>
                  스타일:
                </span>
                <span style={{
                  fontSize: '1.1rem',
                  fontWeight: '600',
                  color: '#475569',
                  padding: '0.25rem 0.75rem',
                  background: '#f1f5f9',
                  borderRadius: '0.5rem',
                  border: '1px solid #e2e8f0'
                }}>
                  {getStyleName(item.selectedStyle)}
                </span>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
                <span style={{
                  fontSize: '0.875rem',
                  color: '#64748b',
                  fontWeight: '600',
                  minWidth: '60px'
                }}>
                  수량:
                </span>
                <span style={{
                  fontSize: '1.1rem',
                  fontWeight: '700',
                  color: '#1e293b',
                  padding: '0.25rem 0.75rem',
                  background: '#fef3c7',
                  borderRadius: '0.5rem',
                  border: '1px solid #fde68a'
                }}>
                  {item.quantity}개
                </span>
              </div>
            </div>
            {item.customizedQuantities && Object.keys(item.customizedQuantities).length > 0 && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                background: '#f8fafc',
                borderRadius: '0.75rem',
                border: '1px solid #e2e8f0'
              }}>
                <div style={{
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  color: '#64748b',
                  marginBottom: '0.75rem'
                }}>
                  구성 음식:
                </div>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem'
                }}>
                  {Object.entries(item.customizedQuantities)
                    .filter(([, qty]) => typeof qty === 'number' && qty > 0)
                    .map(([code, qty]) => {
                      const menuItem = item.menu.items.find(i => i.code === code)
                      const allItem = allItems.find(i => i.code === code)
                      const itemLabel = menuItem?.label || allItem?.label || code
                      const isAdditionalItem = !menuItem && allItem
                      return (
                        <div key={code} style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.9rem',
                          color: '#1e293b',
                          padding: isAdditionalItem ? '0.5rem' : '0',
                          background: isAdditionalItem ? 'rgba(102, 126, 234, 0.05)' : 'transparent',
                          borderRadius: isAdditionalItem ? '0.375rem' : '0',
                          border: isAdditionalItem ? '1px solid rgba(102, 126, 234, 0.2)' : 'none',
                          marginBottom: isAdditionalItem ? '0.25rem' : '0'
                        }}>
                          <span style={{ fontWeight: '500' }}>
                            {itemLabel}
                            {isAdditionalItem && (
                              <span style={{ 
                                marginLeft: '0.5rem', 
                                color: '#667eea', 
                                fontSize: '0.8rem', 
                                fontWeight: '600' 
                              }}>
                                (추가 음식)
                              </span>
                            )}
                          </span>
                          <span style={{
                            fontWeight: '700',
                            color: '#667eea',
                            padding: '0.125rem 0.5rem',
                            background: 'white',
                            borderRadius: '0.375rem',
                            border: '1px solid #cbd5e1'
                          }}>
                            {qty as number}개
                          </span>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}
            <p style={{ 
              fontSize: '1.5rem', 
              fontWeight: 'bold',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              marginBottom: '1rem',
              textAlign: 'right'
            }}>
              {item.subTotal.toLocaleString()}원
            </p>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => updateItem(item.id, item.quantity - 1)}
                disabled={item.quantity <= 1}
                style={{ 
                  padding: '0.625rem 1.25rem', 
                  cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                  background: item.quantity <= 1 ? '#f1f5f9' : '#f1f5f9',
                  border: '2px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  color: item.quantity <= 1 ? '#94a3b8' : '#1e293b',
                  fontWeight: '600',
                  transition: 'all 0.25s ease',
                  opacity: item.quantity <= 1 ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (item.quantity > 1) {
                    e.currentTarget.style.background = '#e2e8f0'
                    e.currentTarget.style.borderColor = '#cbd5e1'
                  }
                }}
                onMouseLeave={(e) => {
                  if (item.quantity > 1) {
                    e.currentTarget.style.background = '#f1f5f9'
                    e.currentTarget.style.borderColor = '#e2e8f0'
                  }
                }}
              >
                수량 감소
              </button>
              <button
                onClick={() => updateItem(item.id, item.quantity + 1)}
                style={{ 
                  padding: '0.625rem 1.25rem', 
                  cursor: 'pointer',
                  background: '#f1f5f9',
                  border: '2px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  color: '#1e293b',
                  fontWeight: '600',
                  transition: 'all 0.25s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#e2e8f0'
                  e.currentTarget.style.borderColor = '#cbd5e1'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#f1f5f9'
                  e.currentTarget.style.borderColor = '#e2e8f0'
                }}
              >
                수량 증가
              </button>
              <button
                onClick={() => removeItem(item.id)}
                style={{ 
                  padding: '0.625rem 1.25rem', 
                  background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '0.5rem', 
                  cursor: 'pointer',
                  fontWeight: '600',
                  boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.3)',
                  transition: 'all 0.25s ease'
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
                삭제
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ 
        marginTop: '2rem', 
        padding: '2rem', 
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        borderRadius: '1rem',
        border: '2px solid #e2e8f0',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '0.75rem',
          marginBottom: '1.5rem',
          paddingBottom: '1.5rem',
          borderBottom: '2px solid #e2e8f0'
        }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center'
          }}>
            <strong style={{ fontSize: '1.25rem', color: '#64748b' }}>상품 금액:</strong>
            <strong style={{ fontSize: '1.25rem', color: '#1e293b' }}>
              {cart.totalPrice.toLocaleString()}원
            </strong>
          </div>
          {selectedCoupon && (
            <>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center'
              }}>
                <strong style={{ fontSize: '1.25rem', color: '#0369a1' }}>
                  쿠폰 할인 ({selectedCoupon.coupon.code}):
                </strong>
                <strong style={{ fontSize: '1.25rem', color: '#0369a1' }}>
                  -{selectedCoupon.coupon.discountAmount.toLocaleString()}원
                </strong>
              </div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginTop: '0.5rem',
                paddingTop: '0.75rem',
                borderTop: '2px solid #e2e8f0'
              }}>
                <strong style={{ fontSize: '1.5rem', color: '#1e293b' }}>최종 금액:</strong>
                <strong style={{ 
                  fontSize: '2rem',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                  fontWeight: '800'
                }}>
                  {calculateFinalPrice().toLocaleString()}원
                </strong>
              </div>
            </>
          )}
          {!selectedCoupon && (
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center'
            }}>
              <strong style={{ fontSize: '1.5rem', color: '#1e293b' }}>총 금액:</strong>
              <strong style={{ 
                fontSize: '2rem',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontWeight: '800'
              }}>
                {cart.totalPrice.toLocaleString()}원
              </strong>
            </div>
          )}
        </div>
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.75rem',
            fontWeight: '600',
            color: '#1e293b',
            fontSize: '1.1rem'
          }}>
            보유 쿠폰
          </label>
          {loadingCoupons ? (
            <div style={{ padding: '1rem', textAlign: 'center', color: '#64748b' }}>쿠폰 목록을 불러오는 중...</div>
          ) : availableCoupons.length === 0 ? (
            <div style={{ 
              padding: '1.5rem', 
              background: '#f8fafc',
              borderRadius: '0.75rem',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              color: '#64748b'
            }}>
              사용 가능한 쿠폰이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '300px', overflowY: 'auto' }}>
              {availableCoupons.map((customerCoupon) => (
                <div
                  key={customerCoupon.id}
                  onClick={() => handleSelectCoupon(customerCoupon)}
                  style={{
                    padding: '1rem 1.5rem',
                    border: selectedCoupon?.id === customerCoupon.id 
                      ? '2px solid #667eea' 
                      : '2px solid #e2e8f0',
                    borderRadius: '0.75rem',
                    background: selectedCoupon?.id === customerCoupon.id
                      ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)'
                      : 'white',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedCoupon?.id !== customerCoupon.id) {
                      e.currentTarget.style.borderColor = '#667eea'
                      e.currentTarget.style.background = '#f8fafc'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedCoupon?.id !== customerCoupon.id) {
                      e.currentTarget.style.borderColor = '#e2e8f0'
                      e.currentTarget.style.background = 'white'
                    }
                  }}
                >
                  <div>
                    <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '1rem' }}>
                      {customerCoupon.coupon.code}
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                      {customerCoupon.coupon.discountAmount.toLocaleString()}원 할인
                    </div>
                  </div>
                  {selectedCoupon?.id === customerCoupon.id && (
                    <div style={{
                      padding: '0.375rem 0.75rem',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      borderRadius: '9999px',
                      fontSize: '0.875rem',
                      fontWeight: '600'
                    }}>
                      선택됨
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {selectedCoupon && (
            <div style={{ 
              marginTop: '1rem',
              padding: '1rem', 
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
              borderRadius: '0.75rem',
              border: '1px solid #bae6fd',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <p style={{ margin: 0, color: '#0369a1', fontWeight: '600', fontSize: '1rem' }}>
                  선택된 쿠폰: {selectedCoupon.coupon.code}
                </p>
                <p style={{ margin: '0.25rem 0 0 0', color: '#0284c7', fontSize: '0.875rem' }}>
                  할인 금액: {selectedCoupon.coupon.discountAmount.toLocaleString()}원
                </p>
              </div>
              <button
                onClick={handleRemoveCoupon}
                style={{ 
                  padding: '0.5rem 1rem', 
                  background: 'white',
                  color: '#ef4444', 
                  border: '1px solid #fca5a5', 
                  borderRadius: '0.5rem', 
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  transition: 'all 0.25s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#fee2e2'
                  e.currentTarget.style.borderColor = '#ef4444'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'white'
                  e.currentTarget.style.borderColor = '#fca5a5'
                }}
              >
                제거
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            // 쿠폰이 선택되어 있으면 sessionStorage에 저장하여 주문 생성 후 적용
            if (selectedCoupon) {
              sessionStorage.setItem('pendingCustomerCouponId', selectedCoupon.id.toString())
            }
            navigate('/order')
          }}
          style={{ 
            width: '100%', 
            padding: '1.25rem', 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white', 
            border: 'none', 
            borderRadius: '0.75rem', 
            fontSize: '1.25rem',
            fontWeight: '700',
            cursor: 'pointer',
            boxShadow: '0 10px 15px -3px rgba(102, 126, 234, 0.3)',
            transition: 'all 0.25s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(102, 126, 234, 0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(102, 126, 234, 0.3)'
          }}
        >
          주문하기
        </button>
      </div>
    </div>
  )
}

export default Cart

