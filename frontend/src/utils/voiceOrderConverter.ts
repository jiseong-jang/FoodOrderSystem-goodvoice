import { VoiceOrderSummary, VoiceOrderItem, AddCartItemRequest, MenuType, StyleType, DeliveryType, CustomerCoupon, Item } from '../types'

/**
 * 음성인식 주문 결과(OrderSummary)를 AddCartItemRequest로 변환하는 유틸리티
 */

// 메뉴 이름 → MenuType 매핑 (공백 유무, 대소문자 무시)
const menuNameToTypeMap: Record<string, MenuType> = {
  '발렌타인 디너': MenuType.VALENTINE,
  '발렌타인디너': MenuType.VALENTINE,
  '발렌타인': MenuType.VALENTINE,
  '프렌치 디너': MenuType.FRENCH,
  '프렌치디너': MenuType.FRENCH,
  '프렌치': MenuType.FRENCH,
  '잉글리시 디너': MenuType.ENGLISH,
  '잉글리시디너': MenuType.ENGLISH,
  '잉글리시': MenuType.ENGLISH,
  '샴페인 축제 디너': MenuType.CHAMPAGNE_FESTIVAL,
  '샴페인축제디너': MenuType.CHAMPAGNE_FESTIVAL,
  '샴페인 축제': MenuType.CHAMPAGNE_FESTIVAL,
  '샴페인축제': MenuType.CHAMPAGNE_FESTIVAL,
}

// 스타일 이름 → StyleType 매핑 (공백 유무, 대소문자 무시)
const styleNameToTypeMap: Record<string, StyleType> = {
  '심플 스타일': StyleType.SIMPLE,
  '심플스타일': StyleType.SIMPLE,
  '심플': StyleType.SIMPLE,
  '그랜드 스타일': StyleType.GRAND,
  '그랜드스타일': StyleType.GRAND,
  '그랜드': StyleType.GRAND,
  '디럭스 스타일': StyleType.DELUXE,
  '디럭스스타일': StyleType.DELUXE,
  '디럭스': StyleType.DELUXE,
}

// 구성 음식 한글 이름 → MenuItemCode 매핑
const itemNameToCodeMap: Record<string, string> = {
  '에그 스크램블': 'EGG_SCRAMBLE',
  '베이컨': 'BACON',
  '기본 빵': 'BREAD',
  '빵': 'BREAD',
  '스테이크': 'STEAK',
  '와인(병)': 'WINE_BOTTLE',
  '와인(잔)': 'WINE_GLASS',
  '커피': 'COFFEE',
  '샐러드': 'SALAD',
  '샴페인': 'CHAMPAGNE',
  '바게트빵': 'BAGUETTE',
  '커피 포트': 'COFFEE_POT',
}

/**
 * 메뉴 이름으로 MenuType 찾기 (유연한 매칭)
 */
export function getMenuTypeFromName(menuName: string | null | undefined): MenuType | null {
  if (!menuName) return null
  
  // 정규화: 공백 제거, 소문자 변환
  const normalizedName = menuName.trim()
  const noSpaceName = normalizedName.replace(/\s+/g, '')
  
  // 정확한 매칭 시도
  if (menuNameToTypeMap[normalizedName]) {
    return menuNameToTypeMap[normalizedName]
  }
  if (menuNameToTypeMap[noSpaceName]) {
    return menuNameToTypeMap[noSpaceName]
  }
  
  // 부분 매칭 시도 (예: "발렌타인 디너 세트" -> "발렌타인")
  for (const [key, value] of Object.entries(menuNameToTypeMap)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return value
    }
    if (noSpaceName.includes(key.replace(/\s+/g, '')) || key.replace(/\s+/g, '').includes(noSpaceName)) {
      return value
    }
  }
  
  console.warn(`알 수 없는 메뉴 이름: "${menuName}" (정규화: "${normalizedName}", 공백제거: "${noSpaceName}")`)
  return null
}

/**
 * 스타일 이름으로 StyleType 찾기 (유연한 매칭)
 */
export function getStyleTypeFromName(styleName: string | null | undefined): StyleType {
  if (!styleName) return StyleType.SIMPLE // 기본값
  
  // 정규화: 공백 제거
  const normalizedName = styleName.trim()
  const noSpaceName = normalizedName.replace(/\s+/g, '')
  
  // 정확한 매칭 시도
  if (styleNameToTypeMap[normalizedName]) {
    return styleNameToTypeMap[normalizedName]
  }
  if (styleNameToTypeMap[noSpaceName]) {
    return styleNameToTypeMap[noSpaceName]
  }
  
  // 부분 매칭 시도
  for (const [key, value] of Object.entries(styleNameToTypeMap)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return value
    }
    if (noSpaceName.includes(key.replace(/\s+/g, '')) || key.replace(/\s+/g, '').includes(noSpaceName)) {
      return value
    }
  }
  
  console.warn(`알 수 없는 스타일 이름: "${styleName}", 기본값(SIMPLE) 사용`)
  return StyleType.SIMPLE
}

/**
 * 구성 음식 문자열을 파싱하여 customizedQuantities Map으로 변환
 * 예: "에그 스크램블=1, 베이컨=2" → { "EGG_SCRAMBLE": 1, "BACON": 2 }
 * @param menuItemsString 파싱할 메뉴 아이템 문자열
 * @param allItems 모든 아이템 목록 (한글 이름으로 매칭하기 위해 사용)
 */
export function parseMenuItems(
  menuItemsString: string | null | undefined,
  allItems?: Array<{ code: string; label: string }>
): Record<string, number> {
  const quantities: Record<string, number> = {}
  
  if (!menuItemsString) return quantities
  
  // 쉼표로 구분된 항목들을 파싱
  const items = menuItemsString.split(',').map(item => item.trim())
  
  for (const item of items) {
    if (!item || !item.includes('=')) continue
    
    const [itemName, quantityStr] = item.split('=').map(s => s.trim())
    if (!itemName || !quantityStr) continue
    
    // "미확인" 등 잘못된 값은 스킵
    if (quantityStr === '미확인' || quantityStr.toLowerCase() === 'null') continue
    
    const quantity = parseInt(quantityStr, 10)
    if (isNaN(quantity) || quantity <= 0) continue
    
    // 한글 이름을 코드로 변환
    // 1. 먼저 itemNameToCodeMap에서 검색
    let itemCode = itemNameToCodeMap[itemName]
    
    // 2. itemNameToCodeMap에서 찾지 못했고 allItems가 제공된 경우, allItems에서 한글 이름으로 검색
    if (!itemCode && allItems && allItems.length > 0) {
      const matchedItem = allItems.find(item => {
        // 정확한 매칭
        if (item.label === itemName) return true
        // 부분 매칭 (한글 이름이 포함되어 있는지)
        if (item.label.includes(itemName) || itemName.includes(item.label)) return true
        return false
      })
      if (matchedItem) {
        itemCode = matchedItem.code
        console.log(`[메뉴 아이템 파싱] 한글 이름 매칭: "${itemName}" → ${matchedItem.code} (${matchedItem.label})`)
      }
    }
    
    if (itemCode) {
      quantities[itemCode] = quantity
    } else {
      console.warn(`[메뉴 아이템 파싱] 알 수 없는 아이템: "${itemName}" (수량: ${quantity})`)
    }
  }
  
  return quantities
}

/**
 * MenuType으로 메뉴 ID 찾기 (메뉴 목록에서 검색)
 */
export function findMenuIdByType(
  menuType: MenuType,
  menus: Array<{ id: number; type: MenuType }>
): number | null {
  const menu = menus.find(m => m.type === menuType)
  return menu?.id || null
}

/**
 * 단일 OrderItem을 AddCartItemRequest로 변환 (내부 헬퍼 함수)
 */
function convertOrderItemToCartItemRequest(
  item: VoiceOrderItem,
  menus: Array<{ id: number; type: MenuType }>,
  allItems?: Item[]
): AddCartItemRequest | null {
  console.log(`[항목 변환] 시작:`, item)
  
  // 필수 필드 확인
  if (!item.menuName) {
    console.error('[항목 변환] 메뉴 이름이 없습니다.')
    return null
  }
  
  // MenuType 찾기
  const menuType = getMenuTypeFromName(item.menuName)
  if (!menuType) {
    console.error(`[항목 변환] 알 수 없는 메뉴 이름: "${item.menuName}"`)
    console.error(`[항목 변환] 사용 가능한 메뉴 타입:`, Object.values(MenuType))
    return null
  }
  console.log(`[항목 변환] 메뉴 타입 찾음: ${menuType}`)
  
  // 메뉴 ID 찾기
  const menuId = findMenuIdByType(menuType, menus)
  if (!menuId) {
    console.error(`[항목 변환] 메뉴 ID를 찾을 수 없습니다. 타입: ${menuType}`)
    console.error(`[항목 변환] 사용 가능한 메뉴:`, menus.map(m => ({ id: m.id, type: m.type })))
    return null
  }
  console.log(`[항목 변환] 메뉴 ID 찾음: ${menuId}`)
  
  // StyleType 찾기
  let styleType = getStyleTypeFromName(item.menuStyle)
  console.log(`[항목 변환] 스타일 타입: ${styleType} (원본: "${item.menuStyle}")`)
  
  // 샴페인 축제 디너는 SIMPLE 스타일을 사용할 수 없으므로 기본값을 GRAND로 설정
  if (menuType === MenuType.CHAMPAGNE_FESTIVAL && styleType === StyleType.SIMPLE) {
    styleType = StyleType.GRAND
    console.log(`[항목 변환] 샴페인 축제 디너는 SIMPLE 스타일을 사용할 수 없으므로 GRAND로 변경`)
  }
  
  // 구성 음식 파싱 (모든 아이템 목록 전달하여 한글 이름으로도 매칭)
  const customizedQuantities = parseMenuItems(item.menuItems, allItems)
  console.log(`[항목 변환] 구성 음식:`, customizedQuantities)
  
  // 수량 처리
  const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1
  console.log(`[항목 변환] 수량: ${quantity}`)

  const result = {
    menuId,
    styleType,
    customizedQuantities: Object.keys(customizedQuantities).length > 0 ? customizedQuantities : {},
    quantity,
  }
  
  console.log(`[항목 변환] 완료:`, result)
  return result
}

/**
 * OrderSummary를 AddCartItemRequest 배열로 변환 (여러 메뉴 지원)
 */
export function convertOrderSummaryToCartItemRequests(
  summary: VoiceOrderSummary,
  menus: Array<{ id: number; type: MenuType }>,
  allItems?: Item[]
): AddCartItemRequest[] {
  const requests: AddCartItemRequest[] = []
  
  console.log('[주문 변환] OrderSummary:', JSON.stringify(summary, null, 2))
  console.log('[주문 변환] 사용 가능한 메뉴:', menus.map(m => ({ id: m.id, type: m.type })))
  
  // orderItems 배열이 있으면 사용 (새로운 방식)
  if (summary.orderItems && summary.orderItems.length > 0) {
    console.log(`[주문 변환] ${summary.orderItems.length}개의 주문 항목 처리 중...`)
    for (const item of summary.orderItems) {
      console.log(`[주문 변환] 항목 처리 중:`, item)
      const request = convertOrderItemToCartItemRequest(item, menus, allItems)
      if (request) {
        console.log(`[주문 변환] 항목 변환 성공:`, request)
        requests.push(request)
      } else {
        console.error(`[주문 변환] 항목 변환 실패:`, item)
      }
    }
  }
  // 하위 호환성: 기존 단일 필드 사용
  else if (summary.menuName) {
    console.log('[주문 변환] 단일 메뉴 모드 (하위 호환성)')
    const singleItem: VoiceOrderItem = {
      menuName: summary.menuName,
      menuStyle: summary.menuStyle,
      menuItems: summary.menuItems,
      quantity: summary.quantity && summary.quantity > 0 ? summary.quantity : 1
    }
    const request = convertOrderItemToCartItemRequest(singleItem, menus, allItems)
    if (request) {
      console.log('[주문 변환] 단일 메뉴 변환 성공:', request)
      requests.push(request)
    } else {
      console.error('[주문 변환] 단일 메뉴 변환 실패:', singleItem)
    }
  } else {
    console.error('[주문 변환] 주문 정보가 없습니다. orderItems와 menuName 모두 비어있음.')
  }
  
  console.log(`[주문 변환] 최종 변환 결과: ${requests.length}개 항목`)
  return requests
}

/**
 * @deprecated convertOrderSummaryToCartItemRequests를 사용하세요
 * OrderSummary를 AddCartItemRequest로 변환 (단일 메뉴만 지원)
 */
export function convertOrderSummaryToCartItemRequest(
  summary: VoiceOrderSummary,
  menus: Array<{ id: number; type: MenuType }>,
  allItems?: Item[]
): AddCartItemRequest | null {
  const requests = convertOrderSummaryToCartItemRequests(summary, menus, allItems)
  return requests.length > 0 ? requests[0] : null
}

/**
 * deliveryTime으로부터 DeliveryType 결정
 */
export function parseDeliveryType(deliveryTime: string | null | undefined): DeliveryType {
  if (!deliveryTime) {
    return DeliveryType.IMMEDIATE
  }

  try {
    const deliveryDate = new Date(deliveryTime)
    const now = new Date()
    
    // 미래 시간이면 예약 주문
    if (deliveryDate > now) {
      return DeliveryType.RESERVATION
    }
  } catch (error) {
    console.error('날짜 파싱 실패:', error)
  }

  return DeliveryType.IMMEDIATE
}

/**
 * 예약 시간 문자열 파싱
 */
export function parseReservationTime(deliveryTime: string | null | undefined): string | undefined {
  if (!deliveryTime) {
    return undefined
  }

  try {
    const date = new Date(deliveryTime)
    if (isNaN(date.getTime())) {
      return undefined
    }

    // ISO 8601 형식으로 변환 (YYYY-MM-DDTHH:mm:ss)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
  } catch (error) {
    console.error('예약 시간 파싱 실패:', error)
    return undefined
  }
}

/**
 * 배달 날짜/시간을 rule-based로 파싱 (2025-12-08 기준)
 * @param text 사용자 입력 텍스트
 * @returns ISO 8601 형식의 날짜/시간 문자열 또는 null
 */
export function parseDeliveryDateTime(text: string | null | undefined): string | null {
  if (!text) return null
  
  const normalizedText = text.trim()
  // 실제 현재 날짜 사용
  const today = new Date()
  today.setHours(0, 0, 0, 0) // 시간을 00:00:00으로 설정
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfterTomorrow = new Date(today)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)
  
  let targetDate: Date | null = null
  let targetHour = 18 // 기본 시간: 오후 6시
  let targetMinute = 0
  
  // 날짜 파싱
  // "내일", "내일 오후 6시", "다음날" 등
  if (normalizedText.includes('내일') || normalizedText.includes('다음날')) {
    targetDate = new Date(tomorrow)
  }
  // "모레", "다다음날"
  else if (normalizedText.includes('모레') || normalizedText.includes('다다음날')) {
    targetDate = new Date(dayAfterTomorrow)
  }
  // "오늘"
  else if (normalizedText.includes('오늘')) {
    targetDate = new Date(today)
  }
  
  // "12월 8일", "12/8", "12-8", "2025-12-08" 등 (날짜 패턴이 있으면 파싱)
  if (!targetDate) {
    const datePatterns = [
      /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
      /(\d{4})-(\d{1,2})-(\d{1,2})/,
      /(\d{1,2})월\s*(\d{1,2})일/,
      /(\d{1,2})\/(\d{1,2})/,
      /(\d{1,2})-(\d{1,2})/,
    ]
    
    for (const pattern of datePatterns) {
      const match = normalizedText.match(pattern)
      if (match) {
        if (match.length === 4 && match[1].length === 4) {
          // 2025년 12월 8일 형식
          const year = parseInt(match[1])
          const month = parseInt(match[2]) - 1
          const day = parseInt(match[3])
          targetDate = new Date(year, month, day)
        } else if (match.length === 4) {
          // 2025-12-08 형식
          const year = parseInt(match[1])
          const month = parseInt(match[2]) - 1
          const day = parseInt(match[3])
          targetDate = new Date(year, month, day)
        } else if (match.length === 3) {
          // 12월 8일, 12/8, 12-8 형식 (2025년 가정)
          const month = parseInt(match[1]) - 1
          const day = parseInt(match[2])
          targetDate = new Date(2025, month, day)
        }
        if (targetDate) break
      }
    }
  }
  
  // 시간 파싱
  // "오후 6시", "오후 6시 30분"
  const pmMatch = normalizedText.match(/오후\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/)
  if (pmMatch) {
    targetHour = parseInt(pmMatch[1]) + 12
    if (targetHour === 24) targetHour = 12 // 오후 12시는 12시
    if (pmMatch[2]) targetMinute = parseInt(pmMatch[2])
  }
  // "오전 10시"
  else {
    const amMatch = normalizedText.match(/오전\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/)
    if (amMatch) {
      targetHour = parseInt(amMatch[1])
      if (targetHour === 12) targetHour = 0 // 오전 12시는 0시
      if (amMatch[2]) targetMinute = parseInt(amMatch[2])
    }
    // "18시", "18:30"
    else {
      const hourMatch = normalizedText.match(/(\d{1,2})시(?:\s*(\d{1,2})분)?|(\d{1,2}):(\d{1,2})/)
      if (hourMatch) {
        if (hourMatch[1]) {
          targetHour = parseInt(hourMatch[1])
          if (hourMatch[2]) targetMinute = parseInt(hourMatch[2])
        } else if (hourMatch[3]) {
          targetHour = parseInt(hourMatch[3])
          if (hourMatch[4]) targetMinute = parseInt(hourMatch[4])
        }
      }
    }
  }
  
  if (!targetDate) return null
  
  // ISO 8601 형식으로 변환
  targetDate.setHours(targetHour, targetMinute, 0, 0)
  
  const year = targetDate.getFullYear()
  const month = String(targetDate.getMonth() + 1).padStart(2, '0')
  const day = String(targetDate.getDate()).padStart(2, '0')
  const hours = String(targetDate.getHours()).padStart(2, '0')
  const minutes = String(targetDate.getMinutes()).padStart(2, '0')
  const seconds = String(targetDate.getSeconds()).padStart(2, '0')
  
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

/**
 * 대화 히스토리에서 배달 날짜/시간 추출 (rule-based)
 * @param history 대화 히스토리
 * @returns ISO 8601 형식의 날짜/시간 문자열 또는 null
 */
export function extractDeliveryTimeFromHistory(history: Array<{ role: string; content: string }>): string | null {
  // 최근 메시지부터 역순으로 검색
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    if (message.role === 'user') {
      const parsed = parseDeliveryDateTime(message.content)
      if (parsed) return parsed
    }
  }
  return null
}

/**
 * 대화 히스토리에서 메뉴 정보 추출 (rule-based fallback)
 * @param history 대화 히스토리
 * @returns VoiceOrderItem 배열 또는 null
 */
export function extractMenuInfoFromHistory(
  history: Array<{ role: string; content: string }>
): Array<{ menuName: string; menuStyle?: string; quantity: number }> | null {
  const menuNames = ['발렌타인 디너', '프렌치 디너', '잉글리시 디너', '샴페인 축제 디너']
  const styleNames = ['심플 스타일', '그랜드 스타일', '디럭스 스타일', '심플', '그랜드', '디럭스']
  
  const foundMenus: Array<{ menuName: string; menuStyle?: string; quantity: number }> = []
  const foundMenuNames = new Set<string>()
  
  // 전체 히스토리를 검색 (최근 메시지부터 역순)
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]
    const content = message.content
    
    // 메뉴 이름 찾기 (대소문자 무시)
    for (const menuName of menuNames) {
      // 정확한 메뉴 이름 매칭 (부분 매칭 방지)
      const menuNameLower = menuName.toLowerCase()
      const contentLower = content.toLowerCase()
      
      // 메뉴 이름이 포함되어 있고, 아직 찾지 않은 메뉴인 경우
      if (contentLower.includes(menuNameLower) && !foundMenuNames.has(menuName)) {
        // 같은 메시지에서 스타일 찾기
        let foundStyle: string | undefined
        for (const styleName of styleNames) {
          if (contentLower.includes(styleName.toLowerCase())) {
            // 가장 긴 스타일 이름 우선 (예: "심플 스타일" > "심플")
            if (!foundStyle || styleName.length > foundStyle.length) {
              foundStyle = styleName
            }
          }
        }
        
        // 수량 찾기 (기본값 1)
        // "발렌타인 디너 2개", "프렌치 디너 1세트" 등
        const quantityPatterns = [
          new RegExp(`${menuNameLower}\\s*(?:을|를)?\\s*(\\d+)\\s*(?:개|세트|인분|명)`, 'i'),
          new RegExp(`(\\d+)\\s*(?:개|세트|인분|명)\\s*(?:의)?\\s*${menuNameLower}`, 'i'),
        ]
        
        let quantity = 1
        for (const pattern of quantityPatterns) {
          const match = content.match(pattern)
          if (match) {
            quantity = parseInt(match[1])
            break
          }
        }
        
        foundMenuNames.add(menuName)
        foundMenus.push({
          menuName,
          menuStyle: foundStyle,
          quantity: quantity > 0 ? quantity : 1
        })
      }
    }
  }
  
  console.log('[메뉴 추출] 대화 히스토리에서 찾은 메뉴:', foundMenus)
  return foundMenus.length > 0 ? foundMenus : null
}

/**
 * 쿠폰 코드 또는 이름으로 고객 쿠폰 찾기
 */
export function findCouponByCodeOrName(
  couponCode: string | null | undefined,
  customerCoupons: CustomerCoupon[]
): CustomerCoupon | null {
  if (!couponCode) {
    return null
  }

  const normalizedCode = couponCode.trim().toUpperCase()

  // 사용 가능한 쿠폰만 필터링
  const availableCoupons = customerCoupons.filter(c => !c.isUsed)

  // 정확한 코드 매칭
  let matchedCoupon = availableCoupons.find(
    c => c.coupon.code.toUpperCase() === normalizedCode
  )

  if (matchedCoupon) {
    return matchedCoupon
  }

  // 부분 매칭 (예: "REGULAR10000"에서 "REGULAR" 검색)
  matchedCoupon = availableCoupons.find(
    c => c.coupon.code.toUpperCase().includes(normalizedCode) ||
         normalizedCode.includes(c.coupon.code.toUpperCase())
  )

  if (matchedCoupon) {
    return matchedCoupon
  }

  // 한글 이름 매칭 (예: "단골 쿠폰", "REGULAR10000")
  const koreanNames: Record<string, string> = {
    '단골': 'REGULAR',
    '단골 쿠폰': 'REGULAR',
    '단골고객': 'REGULAR',
    '단골 고객': 'REGULAR',
  }

  const matchedKoreanName = koreanNames[normalizedCode] || koreanNames[couponCode.trim()]
  if (matchedKoreanName) {
    matchedCoupon = availableCoupons.find(
      c => c.coupon.code.toUpperCase().includes(matchedKoreanName)
    )
    if (matchedCoupon) {
      return matchedCoupon
    }
  }

  return null
}

