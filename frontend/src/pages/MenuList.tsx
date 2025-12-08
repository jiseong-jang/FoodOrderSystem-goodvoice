import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useMenuStore } from '../store/menuStore'
import { useCartStore } from '../store/cartStore'
import { useAuthStore } from '../store/authStore'
import { MenuType, ChatMessage, VoiceOrderSummary, CustomerCoupon, Menu, Item } from '../types'
import { voiceOrderApi } from '../api/voiceOrder'
import { customerApi } from '../api/customer'
import { menuApi } from '../api/menu'
import { 
  convertOrderSummaryToCartItemRequests,
  extractDeliveryTimeFromHistory,
  extractMenuInfoFromHistory
} from '../utils/voiceOrderConverter'
import LoadingSpinner from '../components/LoadingSpinner'
import ErrorMessage from '../components/ErrorMessage'

// 메뉴 hover 툴팁 컴포넌트
const MenuHoverTooltip = ({ menuName, menu }: { menuName: string; menu: Menu }) => {
  const [isHovered, setIsHovered] = useState(false)
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const spanRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  
  const getMenuDescription = (menuType: MenuType): string => {
    const descriptions: Record<MenuType, string> = {
      [MenuType.VALENTINE]: '작은 하트 모양과 큐피드가 장식된 접시 1개, 와인 1병, 스테이크 1개',
      [MenuType.FRENCH]: '커피 1잔, 와인 1잔, 샐러드 1개, 스테이크 1개',
      [MenuType.ENGLISH]: '에그 스크램블 1개, 베이컨 1개, 빵 1개, 스테이크 1개',
      [MenuType.CHAMPAGNE_FESTIVAL]: '샴페인 1병, 바게트빵 4개, 커피 포트 1개, 와인 1병, 스테이크 2개',
    }
    return descriptions[menuType] || ''
  }
  
  const handleMouseEnter = () => {
    setIsHovered(true)
    // 위치 계산을 다음 렌더링 사이클에서 수행
    setTimeout(() => {
      if (spanRef.current && tooltipRef.current) {
        const spanRect = spanRef.current.getBoundingClientRect()
        const tooltipRect = tooltipRef.current.getBoundingClientRect()
        const viewportWidth = window.innerWidth
        
        const tooltipWidth = tooltipRect.width || 350
        const tooltipHeight = tooltipRect.height || 300
        
        // 기본 위치: 텍스트 위, 중앙 정렬
        let left = spanRect.left + spanRect.width / 2 - tooltipWidth / 2
        let top = spanRect.top - tooltipHeight - 8
        
        // 화면 왼쪽 경계 체크
        if (left < 10) {
          left = 10
        }
        // 화면 오른쪽 경계 체크
        else if (left + tooltipWidth > viewportWidth - 10) {
          left = viewportWidth - tooltipWidth - 10
        }
        
        // 화면 위쪽 경계 체크 (공간이 부족하면 아래쪽에 표시)
        if (top < 10) {
          top = spanRect.bottom + 8
        }
        
        setTooltipStyle({
          position: 'fixed',
          top: `${top}px`,
          left: `${left}px`,
        })
      }
    }, 0)
  }
  
  const handleMouseLeave = () => {
    setIsHovered(false)
  }
  
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        ref={spanRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          cursor: 'help',
          color: '#667eea',
          fontWeight: '600'
        }}
      >
        {menuName}
      </span>
      {isHovered && createPortal(
        <div
          ref={tooltipRef}
          style={{
            ...tooltipStyle,
            background: 'white',
            border: '2px solid #667eea',
            borderRadius: '0.75rem',
            padding: '1rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
            zIndex: 10000,
            width: '350px',
            maxHeight: '400px',
            overflowY: 'auto',
            pointerEvents: 'auto'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <h4 style={{
            margin: '0 0 0.75rem 0',
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#1e293b',
            borderBottom: '2px solid #e2e8f0',
            paddingBottom: '0.5rem'
          }}>
            {menuName}
          </h4>
          <p style={{
            margin: '0 0 0.75rem 0',
            fontSize: '0.95rem',
            color: '#64748b',
            lineHeight: '1.6'
          }}>
            {getMenuDescription(menu.type)}
          </p>
          <div style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            background: '#f8fafc',
            borderRadius: '0.5rem',
            border: '1px solid #e2e8f0'
          }}>
            <p style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.9rem',
              fontWeight: '600',
              color: '#1e293b'
            }}>
              기본 가격: <span style={{ color: '#667eea', fontWeight: '700' }}>{menu.basePrice.toLocaleString()}원</span>
            </p>
          </div>
          <div>
            <p style={{
              margin: '0 0 0.5rem 0',
              fontSize: '0.9rem',
              fontWeight: '600',
              color: '#1e293b'
            }}>
              구성 음식:
            </p>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.375rem'
            }}>
              {menu.items.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.875rem',
                    color: '#475569',
                    padding: '0.25rem 0'
                  }}
                >
                  <span>
                    {item.label}
                    {item.defaultQuantity && item.defaultQuantity > 1 && (
                      <span style={{ color: '#94a3b8', marginLeft: '0.25rem' }}>
                        x {item.defaultQuantity}
                      </span>
                    )}
                  </span>
                  {item.unitPrice > 0 && (
                    <span style={{ fontWeight: '600', color: '#667eea' }}>
                      {item.unitPrice.toLocaleString()}원
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body
      )}
    </span>
  )
}

const MenuList = () => {
  const { menus, loading, error, fetchMenus } = useMenuStore()
  const { addItem, clearCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const [isVoiceMode, setIsVoiceMode] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [recognizedText, setRecognizedText] = useState('')
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([])
  const conversationEndRef = useRef<HTMLDivElement>(null)
  const conversationContainerRef = useRef<HTMLDivElement>(null)
  const [orderSummary, setOrderSummary] = useState<VoiceOrderSummary | null>(null)
  const [voiceError, setVoiceError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [textInput, setTextInput] = useState('')
  const [isServerConnected, setIsServerConnected] = useState<boolean | null>(null)
  const [customerName, setCustomerName] = useState<string>('')
  const [_availableCoupons, setAvailableCoupons] = useState<CustomerCoupon[]>([])
  const [_hasInitialGreeting, setHasInitialGreeting] = useState(false)
  const [allItems, setAllItems] = useState<Item[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const speechSynthesisRef = useRef<SpeechSynthesis | null>(null)

  useEffect(() => {
    fetchMenus()
    fetchAllItems()
  }, [fetchMenus])

  const fetchAllItems = async () => {
    try {
      const response = await menuApi.getAllItems()
      if (response.success && response.data) {
        setAllItems(response.data)
      }
    } catch (err) {
      console.error('아이템 목록 조회 실패:', err)
    }
  }

  // 대화 히스토리가 변경될 때마다 스크롤을 맨 아래로
  useEffect(() => {
    if (conversationEndRef.current && conversationContainerRef.current) {
      // 약간의 지연을 두어 DOM 업데이트 후 스크롤
      setTimeout(() => {
        conversationContainerRef.current?.scrollTo({
          top: conversationContainerRef.current.scrollHeight,
          behavior: 'smooth'
        })
      }, 100)
    }
  }, [conversationHistory])

  // 음성인식 모드 진입 시 전체 초기화 (서버 연결, 쿠폰, 프로필, 인사)
  useEffect(() => {
    if (isVoiceMode && isAuthenticated) {
      const initializeVoiceMode = async () => {
        try {
          console.log('🎤 음성인식 모드 초기화 시작')
          
          // 1. 서버 연결 확인
          const isConnected = await checkServerConnection()
          console.log('서버 연결 상태:', isConnected)

          // 2. 쿠폰 목록 조회
          fetchAvailableCoupons()
          
          // 3. 고객 프로필 조회
          let name = '고객님'
          try {
            const profileResponse = await customerApi.getProfile()
            if (profileResponse.success && profileResponse.data) {
              name = profileResponse.data.name || '고객님'
              console.log('고객 이름:', name)
            }
          } catch (err: any) {
            console.error('고객 프로필 조회 실패:', err)
            // 프로필 조회 실패해도 기본 이름으로 진행
          }
          
          setCustomerName(name)
          
          // 4. 초기 인사 메시지 설정 (음성인식 모드 진입 시마다 인사)
          if (isConnected) {
            // 서버 연결 성공 시 FastAPI에서 인사 가져오기
            console.log('FastAPI에서 인사 메시지 가져오기 시도')
            await initializeGreeting(name)
          } else {
            // 서버 연결 실패 시 기본 인사 메시지
            console.log('서버 미연결, 기본 인사 메시지 사용')
            const defaultGreeting = `안녕하세요, ${name} 고객님. 원하시는 디너 주문을 말씀해 주세요.`
            const greetingMessage: ChatMessage = { role: 'assistant', content: defaultGreeting }
            setConversationHistory([greetingMessage])
            setHasInitialGreeting(true)
            setTimeout(() => {
              speakText(defaultGreeting)
            }, 300)
          }
        } catch (err: any) {
          console.error('음성인식 모드 초기화 실패:', err)
          // 에러 발생 시에도 기본 인사 메시지 표시
          const defaultGreeting = `안녕하세요, 고객님. 원하시는 디너 주문을 말씀해 주세요.`
          const greetingMessage: ChatMessage = { role: 'assistant', content: defaultGreeting }
          setConversationHistory([greetingMessage])
          setHasInitialGreeting(true)
          setTimeout(() => {
            speakText(defaultGreeting)
          }, 300)
        }
      }
      
      initializeVoiceMode()
    }
  }, [isVoiceMode, isAuthenticated])


  // FastAPI 서버 연결 확인
  const checkServerConnection = async () => {
    try {
      await voiceOrderApi.checkHealth()
      setIsServerConnected(true)
      setVoiceError('')
      return true
    } catch (err: any) {
      setIsServerConnected(false)
      setVoiceError('FastAPI 서버에 연결할 수 없습니다. 서버를 실행해주세요.')
      return false
    }
  }

  // 음성인식 모드 종료 시 정리
  useEffect(() => {
    if (!isVoiceMode) {
      stopRecording()
      setConversationHistory([])
      setOrderSummary(null)
      setRecognizedText('')
      setVoiceError('')
      setStatusMessage('')
      setHasInitialGreeting(false)
      // TTS 중지
      if (speechSynthesisRef.current) {
        speechSynthesisRef.current.cancel()
      }
    }
  }, [isVoiceMode])


  // 고객 쿠폰 목록 조회
  const fetchAvailableCoupons = async () => {
    try {
      const response = await customerApi.getCoupons()
      if (response.success && response.data) {
        const unused = response.data.filter(c => !c.isUsed)
        setAvailableCoupons(unused)
      }
    } catch (err: any) {
      console.error('쿠폰 목록 조회 실패:', err)
    }
  }

  // 초기 인사 메시지 설정
  const initializeGreeting = async (name: string) => {
    console.log('초기 인사 메시지 생성 중...')
    
    try {
      const greeting = await voiceOrderApi.getGreeting('ko-KR', name)
      console.log('인사 메시지 받음:', greeting)
      const greetingMessage: ChatMessage = { role: 'assistant', content: greeting }
      setConversationHistory([greetingMessage])
      setHasInitialGreeting(true)
      
      // TTS로 인사 재생 (약간의 지연 후)
      setTimeout(() => {
        speakText(greeting)
      }, 300)
    } catch (err: any) {
      console.error('초기 인사 메시지 가져오기 실패:', err)
      // 실패 시 기본 인사 메시지 사용
      const defaultGreeting = `안녕하세요, ${name} 고객님. 원하시는 디너 주문을 말씀해 주세요.`
      console.log('기본 인사 메시지 사용:', defaultGreeting)
      const greetingMessage: ChatMessage = { role: 'assistant', content: defaultGreeting }
      setConversationHistory([greetingMessage])
      setHasInitialGreeting(true)
      
      setTimeout(() => {
        speakText(defaultGreeting)
      }, 300)
    }
  }

  // TTS: 텍스트를 음성으로 변환
  const speakText = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      console.warn('브라우저가 TTS를 지원하지 않습니다.')
      return
    }

    // 이전 음성 중지
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel()
    }

    speechSynthesisRef.current = window.speechSynthesis

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ko-KR'
    utterance.rate = 0.9
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onend = () => {
      speechSynthesisRef.current = null
    }

    utterance.onerror = (error) => {
      console.error('TTS 오류:', error)
      speechSynthesisRef.current = null
    }

    speechSynthesisRef.current.speak(utterance)
  }

  const getMenuName = (type: MenuType) => {
    switch (type) {
      case MenuType.VALENTINE:
        return '발렌타인 디너'
      case MenuType.FRENCH:
        return '프렌치 디너'
      case MenuType.ENGLISH:
        return '잉글리시 디너'
      case MenuType.CHAMPAGNE_FESTIVAL:
        return '샴페인 축제 디너'
      default:
        return type
    }
  }

  const getMenuImage = (type: MenuType) => {
    switch (type) {
      case MenuType.VALENTINE:
        return '/menuimage/발렌타인디너.png'
      case MenuType.FRENCH:
        return '/menuimage/프렌치디너.png'
      case MenuType.ENGLISH:
        return '/menuimage/잉글리쉬디너.png'
      case MenuType.CHAMPAGNE_FESTIVAL:
        return '/menuimage/샴페인축제디너.png'
      default:
        return ''
    }
  }

  // 음성 녹음 시작
  const startRecording = async () => {
    if (!isAuthenticated) {
      setVoiceError('로그인이 필요합니다.')
      navigate('/login')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('브라우저가 음성 입력을 지원하지 않습니다.')
      return
    }

    try {
      setVoiceError('')
      setStatusMessage('마이크 권한을 요청하는 중...')
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        setIsListening(false)

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          audioChunksRef.current = []
          await transcribeAudio(audioBlob)
        }
      }

      recorder.start()
      setIsListening(true)
      setStatusMessage('음성을 녹음 중입니다...')
    } catch (err: any) {
      console.error('음성 녹음 시작 실패:', err)
      setVoiceError('마이크 접근 권한이 필요합니다.')
      setIsListening(false)
      setStatusMessage('')
    }
  }

  // 음성 녹음 중지
  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setIsListening(false)
    setStatusMessage('')
  }

  // 음성을 텍스트로 변환
  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      setStatusMessage('음성을 텍스트로 변환 중입니다...')
      setIsProcessing(true)
      
      const transcript = await voiceOrderApi.transcribeAudio(audioBlob)
      
      if (transcript) {
        setRecognizedText(prev => prev ? `${prev}\n${transcript}` : transcript)
        await sendMessage(transcript)
      } else {
        setVoiceError('음성을 인식하지 못했습니다.')
        setIsProcessing(false)
        setStatusMessage('')
      }
    } catch (err: any) {
      console.error('음성 인식 실패:', err)
      let errorMessage = '음성 인식 중 오류가 발생했습니다.'
      
      if (err.code === 'ERR_NETWORK' || err.message?.includes('CONNECTION_REFUSED') || err.message?.includes('Network Error')) {
        errorMessage = 'FastAPI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요. (http://localhost:5001)'
      } else if (err.response?.status === 500) {
        errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      }
      
      setVoiceError(errorMessage)
      setIsProcessing(false)
      setStatusMessage('')
    }
  }

  // LLM으로 메시지 전송
  const sendMessage = async (userText: string) => {
    if (!userText.trim()) return

    try {
      setStatusMessage('응답을 생성하는 중입니다...')
      setIsProcessing(true)
      setVoiceError('')

      // 사용자 메시지를 히스토리에 추가
      const userMessage: ChatMessage = { role: 'user', content: userText }
      const updatedHistory = [...conversationHistory, userMessage]
      setConversationHistory(updatedHistory)

      // LLM에 전송
      const response = await voiceOrderApi.generateChat(updatedHistory)

      // 어시스턴트 응답을 히스토리에 추가
      const assistantMessage: ChatMessage = { role: 'assistant', content: response.message }
      setConversationHistory([...updatedHistory, assistantMessage])

      // TTS로 AI 응답 재생
      speakText(response.message)

      // 주문 확정 감지
      if (response.orderConfirmed && response.order) {
        // 배달 날짜/시간을 rule-based로 추출하여 order에 추가
        const extractedDeliveryTime = extractDeliveryTimeFromHistory([...updatedHistory, assistantMessage])
        if (extractedDeliveryTime && !response.order.deliveryTime) {
          response.order.deliveryTime = extractedDeliveryTime
          console.log('[주문 처리] 대화에서 배달 시간 추출:', extractedDeliveryTime)
        }
        
        // 메뉴 정보가 없으면 대화 히스토리에서 추출 (fallback)
        if ((!response.order.orderItems || response.order.orderItems.length === 0) && !response.order.menuName) {
          const extractedMenus = extractMenuInfoFromHistory([...updatedHistory, assistantMessage])
          if (extractedMenus && extractedMenus.length > 0) {
            console.log('[주문 처리] 대화에서 메뉴 정보 추출:', extractedMenus)
            // 단일 메뉴인 경우
            if (extractedMenus.length === 1) {
              response.order.menuName = extractedMenus[0].menuName
              response.order.menuStyle = extractedMenus[0].menuStyle || null
              response.order.quantity = extractedMenus[0].quantity
            } else {
              // 여러 메뉴인 경우
              response.order.orderItems = extractedMenus.map(menu => ({
                menuName: menu.menuName,
                menuStyle: menu.menuStyle || null,
                menuItems: null,
                quantity: menu.quantity
              }))
            }
          }
        }
        
        setOrderSummary(response.order)
        setStatusMessage('주문이 확정되었습니다. 처리 중...')
        await handleOrderConfirmed(response.order, [...updatedHistory, assistantMessage])
      } else {
        setIsProcessing(false)
        setStatusMessage('')
      }
    } catch (err: any) {
      console.error('메시지 전송 실패:', err)
      let errorMessage = '메시지 전송 중 오류가 발생했습니다.'
      
      if (err.code === 'ERR_NETWORK' || err.message?.includes('CONNECTION_REFUSED') || err.message?.includes('Network Error')) {
        errorMessage = 'FastAPI 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요. (http://localhost:5001)'
      } else if (err.response?.status === 500) {
        errorMessage = '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      } else if (err.response?.status === 502) {
        errorMessage = 'LLM 서비스에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.'
      } else if (err.response?.status === 504) {
        errorMessage = '서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
      }
      
      // 에러 메시지를 대화 히스토리에 추가하여 사용자에게 알림
      const errorSystemMessage: ChatMessage = {
        role: 'assistant',
        content: `⚠️ ${errorMessage}\n\n대화를 계속하려면 다시 시도해주세요.`
      }
      setConversationHistory(prev => [...prev, errorSystemMessage])
      
      setVoiceError(errorMessage)
      setIsProcessing(false)
      setStatusMessage('')
    }
  }

  // 주문 확정 처리
  const handleOrderConfirmed = async (summary: VoiceOrderSummary, _finalHistory: ChatMessage[]) => {
    try {
      if (!isAuthenticated) {
        setVoiceError('로그인이 필요합니다.')
        navigate('/login')
        return
      }

      // 0. 고객 이름이 없으면 설정
      if (!summary.customerName && customerName) {
        summary.customerName = customerName
      }

      // 1. 배달 날짜/시간을 rule-based로 추출 (대화 히스토리에서)
      let deliveryTime = summary.deliveryTime
      if (!deliveryTime && _finalHistory) {
        deliveryTime = extractDeliveryTimeFromHistory(_finalHistory) || null
        if (deliveryTime) {
          summary.deliveryTime = deliveryTime
          console.log('[주문 처리] 대화 히스토리에서 배달 시간 추출:', deliveryTime)
        }
      }

      // 배달 타입과 예약 시간을 sessionStorage에 저장하여 주문 페이지에서 자동 설정
      if (deliveryTime) {
        sessionStorage.setItem('voiceOrderDeliveryTime', deliveryTime)
      }

      // OrderSummary를 AddCartItemRequest 배열로 변환 (여러 메뉴 지원)
      console.log('[주문 처리] 주문 요약:', summary)
      console.log('[주문 처리] 메뉴 목록:', menus)
      console.log('[주문 처리] 모든 아이템 목록:', allItems)
      
      const cartItemRequests = convertOrderSummaryToCartItemRequests(summary, menus, allItems)
      
      if (cartItemRequests.length === 0) {
        // 더 자세한 에러 메시지 생성
        let errorMessage = '주문 정보 변환에 실패했습니다.\n'
        
        if (summary.orderItems && summary.orderItems.length > 0) {
          const failedItems = summary.orderItems
            .map(item => item.menuName || '이름 없음')
            .join(', ')
          errorMessage += `주문 항목: ${failedItems}\n`
        } else if (summary.menuName) {
          errorMessage += `주문 메뉴: ${summary.menuName}\n`
        } else {
          errorMessage += '주문 정보가 비어있습니다.\n'
        }
        
        errorMessage += '콘솔을 확인하여 자세한 오류 정보를 확인하세요.'
        
        console.error('[주문 처리] 변환 실패 상세:', {
          summary,
          menus,
          cartItemRequests
        })
        
        setVoiceError(errorMessage)
        setIsProcessing(false)
        setStatusMessage('')
        return
      }

      setStatusMessage('장바구니에 추가하는 중...')

      // 4. 기존 장바구니 비우기
      try {
        await clearCart()
      } catch (err) {
        console.error('장바구니 초기화 실패:', err)
      }

      // 5. 여러 메뉴를 각각 장바구니에 추가
      const errors: string[] = []
      for (let i = 0; i < cartItemRequests.length; i++) {
        try {
          await addItem(cartItemRequests[i])
        } catch (err: any) {
          console.error(`메뉴 ${i + 1} 추가 실패:`, err)
          errors.push(`메뉴 ${i + 1}: ${err.message || '추가 실패'}`)
        }
      }

      if (errors.length > 0) {
        if (errors.length === cartItemRequests.length) {
          // 모든 메뉴 추가 실패
          setVoiceError('모든 메뉴 추가에 실패했습니다: ' + errors.join(', '))
          setIsProcessing(false)
          setStatusMessage('')
          return
        } else {
          // 일부 메뉴만 실패
          setVoiceError(`일부 메뉴 추가에 실패했습니다: ${errors.join(', ')}`)
        }
      }

      setStatusMessage(`${cartItemRequests.length}개의 메뉴가 장바구니에 추가되었습니다!`)

      // 6. 최종 주문 페이지로 바로 이동 (날짜는 자동으로 설정됨)
      setTimeout(() => {
        navigate('/order')
      }, 1000)
    } catch (err: any) {
      console.error('주문 처리 실패:', err)
      setVoiceError(err.message || '주문 처리 중 오류가 발생했습니다.')
      setIsProcessing(false)
      setStatusMessage('')
    }
  }

  // 음성 녹음 버튼 클릭 핸들러
  const handleMicClick = () => {
    if (isListening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // 텍스트 입력 전송 핸들러
  const handleTextSubmit = async () => {
    if (!textInput.trim() || isProcessing || isListening) return

    const text = textInput.trim()
    setTextInput('')
    await sendMessage(text)
  }

  if (loading) return <LoadingSpinner />
  if (error) return <ErrorMessage message={error} />

  return (
    <div style={{ padding: '3rem 2rem', maxWidth: '1200px', margin: '0 auto', minHeight: 'calc(100vh - 200px)' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '3rem'
      }}>
        <h2 style={{ 
          fontSize: '2.5rem',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: '800',
          letterSpacing: '-1px',
          margin: 0
        }}>
          메뉴
        </h2>
        <button
          onClick={() => setIsVoiceMode(!isVoiceMode)}
          style={{
            padding: '0.75rem 1.5rem',
            background: isVoiceMode 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' 
              : 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
            color: isVoiceMode ? 'white' : '#1e293b',
            border: `2px solid ${isVoiceMode ? '#667eea' : '#e2e8f0'}`,
            borderRadius: '0.75rem',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '1rem',
            transition: 'all 0.25s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}
          onMouseEnter={(e) => {
            if (!isVoiceMode) {
              e.currentTarget.style.borderColor = '#667eea'
              e.currentTarget.style.background = '#f8fafc'
            }
          }}
          onMouseLeave={(e) => {
            if (!isVoiceMode) {
              e.currentTarget.style.borderColor = '#e2e8f0'
              e.currentTarget.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)'
            }
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>🎤</span>
          음성 주문
        </button>
      </div>

      {/* 음성인식 섹션 */}
      {isVoiceMode && (
        <div style={{
          background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
          borderRadius: '1rem',
          padding: '2rem',
          marginBottom: '2rem',
          border: '2px solid #e2e8f0',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
        }}>
          <h3 style={{
            marginBottom: '1.5rem',
            fontSize: '1.5rem',
            fontWeight: '700',
            color: '#1e293b'
          }}>
            음성으로 메뉴 주문하기
          </h3>
          
          {/* 상태 메시지 */}
          {statusMessage && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              background: 'rgba(102, 126, 234, 0.1)',
              borderRadius: '0.5rem',
              color: '#667eea',
              fontWeight: '600',
              fontSize: '0.95rem'
            }}>
              {statusMessage}
            </div>
          )}

          {/* 서버 연결 상태 표시 */}
          {isServerConnected === false && (
            <div style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#fef3c7',
              borderRadius: '0.75rem',
              border: '2px solid #fbbf24',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem'
              }}>
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <strong style={{ color: '#92400e', fontSize: '1rem' }}>
                  FastAPI 서버가 실행되지 않았습니다
                </strong>
              </div>
              <div style={{ color: '#78350f', fontSize: '0.9rem', lineHeight: '1.6' }}>
                <p style={{ margin: '0 0 0.5rem 0' }}>
                  서버를 실행하려면:
                </p>
                <ol style={{ margin: '0 0 0.5rem 0', paddingLeft: '1.5rem' }}>
                  <li><code style={{ background: '#fef3c7', padding: '0.125rem 0.25rem', borderRadius: '0.25rem' }}>voice-order-fastapi</code> 폴더로 이동</li>
                  <li><code style={{ background: '#fef3c7', padding: '0.125rem 0.25rem', borderRadius: '0.25rem' }}>start.bat</code> 파일 실행 (또는 CMD에서 명령어 실행)</li>
                </ol>
                <p style={{ margin: '0' }}>
                  자세한 내용은 <code style={{ background: '#fef3c7', padding: '0.125rem 0.25rem', borderRadius: '0.25rem' }}>voice-order-fastapi/README.md</code>를 참고하세요.
                </p>
              </div>
              <button
                onClick={checkServerConnection}
                style={{
                  marginTop: '0.75rem',
                  padding: '0.5rem 1rem',
                  background: '#f59e0b',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                🔄 연결 재확인
              </button>
            </div>
          )}

          {/* 에러 메시지 */}
          {voiceError && isServerConnected !== false && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              background: '#fee2e2',
              borderRadius: '0.5rem',
              color: '#dc2626',
              fontWeight: '600',
              fontSize: '0.95rem'
            }}>
              {voiceError}
            </div>
          )}
          
          {/* 음성인식 버튼 및 상태 */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '2rem'
          }}>
            <button
              onClick={handleMicClick}
              disabled={isProcessing}
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: isListening
                  ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isListening
                  ? '0 0 0 0 rgba(239, 68, 68, 0.7), 0 0 0 0 rgba(239, 68, 68, 0.7)'
                  : '0 10px 15px -3px rgba(102, 126, 234, 0.3)',
                transition: 'all 0.3s ease',
                animation: isListening ? 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' : 'none',
                opacity: isProcessing ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!isListening && !isProcessing) {
                  e.currentTarget.style.transform = 'scale(1.05)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isListening) {
                  e.currentTarget.style.transform = 'scale(1)'
                }
              }}
            >
              <span style={{ fontSize: '3rem' }}>{isListening ? '⏹' : '🎤'}</span>
            </button>
            <p style={{
              fontSize: '1.1rem',
              fontWeight: '600',
              color: isListening ? '#ef4444' : '#64748b',
              margin: 0
            }}>
              {isListening ? '음성 인식 중...' : isProcessing ? '처리 중...' : '마이크를 눌러 주문하세요'}
            </p>
          </div>

          {/* 음성 인식 텍스트 표시 영역 */}
          {recognizedText && (
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              border: '2px solid #e2e8f0',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <p style={{
                margin: '0 0 0.5rem 0',
                fontSize: '0.9rem',
                color: '#64748b',
                fontWeight: '600'
              }}>
                🎤 인식된 텍스트:
              </p>
              <p style={{
                margin: 0,
                fontSize: '1rem',
                color: '#1e293b',
                whiteSpace: 'pre-wrap',
                lineHeight: '1.6'
              }}>
                {recognizedText}
              </p>
            </div>
          )}

          {/* 텍스트 입력 필드 */}
          <div style={{
            marginBottom: '2rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-end'
          }}>
            <div style={{ flex: 1 }}>
              <label style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: '0.9rem',
                fontWeight: '600',
                color: '#64748b'
              }}>
                또는 텍스트로 입력:
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleTextSubmit()
                  }
                }}
                placeholder="예: 발렌타인 디너 1개 주문하고 싶어요"
                disabled={isProcessing || isListening}
                style={{
                  width: '100%',
                  minHeight: '100px',
                  padding: '1rem',
                  fontSize: '1rem',
                  border: '2px solid #e2e8f0',
                  borderRadius: '0.75rem',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  lineHeight: '1.5',
                  background: (isProcessing || isListening) ? '#f1f5f9' : 'white',
                  color: (isProcessing || isListening) ? '#94a3b8' : '#1e293b',
                  transition: 'all 0.25s ease'
                }}
                onFocus={(e) => {
                  if (!isProcessing && !isListening) {
                    e.currentTarget.style.borderColor = '#667eea'
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.1)'
                  }
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
            <button
              onClick={handleTextSubmit}
              disabled={!textInput.trim() || isProcessing || isListening}
              style={{
                padding: '1rem 1.5rem',
                background: (!textInput.trim() || isProcessing || isListening)
                  ? '#cbd5e1'
                  : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '0.75rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: (!textInput.trim() || isProcessing || isListening) ? 'not-allowed' : 'pointer',
                transition: 'all 0.25s ease',
                whiteSpace: 'nowrap',
                opacity: (!textInput.trim() || isProcessing || isListening) ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (textInput.trim() && !isProcessing && !isListening) {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(102, 126, 234, 0.3)'
                }
              }}
              onMouseLeave={(e) => {
                if (textInput.trim() && !isProcessing && !isListening) {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = 'none'
                }
              }}
            >
              전송
            </button>
          </div>

          {/* 대화 히스토리 - 채팅 형식 */}
          <div 
            ref={conversationContainerRef}
            style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              border: '2px solid #e2e8f0',
              maxHeight: '400px',
              overflowY: 'auto',
              minHeight: '200px'
            }}
          >
            <p style={{
              margin: '0 0 1rem 0',
              fontSize: '1rem',
              color: '#1e293b',
              fontWeight: '700'
            }}>
              💬 대화 내역
            </p>
            {conversationHistory.length === 0 ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '150px',
                color: '#94a3b8',
                fontStyle: 'italic'
              }}>
                대화를 시작하려면 마이크 버튼을 누르거나 아래 텍스트 입력창을 사용해주세요
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {conversationHistory.map((msg, idx) => {
                  // 메뉴 이름 감지 함수
                  const getMenuImage = (content: string): string | null => {
                    const menuImageMap: Record<string, string> = {
                      '발렌타인 디너': '/menuimage/발렌타인디너.png',
                      '발렌타인': '/menuimage/발렌타인디너.png',
                      '프렌치 디너': '/menuimage/프렌치디너.png',
                      '프렌치': '/menuimage/프렌치디너.png',
                      '잉글리시 디너': '/menuimage/잉글리쉬디너.png',
                      '잉글리시': '/menuimage/잉글리쉬디너.png',
                      '잉글리쉬 디너': '/menuimage/잉글리쉬디너.png',
                      '잉글리쉬': '/menuimage/잉글리쉬디너.png',
                      '샴페인 축제 디너': '/menuimage/샴페인축제디너.png',
                      '샴페인 축제': '/menuimage/샴페인축제디너.png',
                      '샴페인': '/menuimage/샴페인축제디너.png',
                    }
                    
                    for (const [menuName, imagePath] of Object.entries(menuImageMap)) {
                      if (content.includes(menuName)) {
                        return imagePath
                      }
                    }
                    return null
                  }
                  
                  const menuImage = msg.role === 'assistant' ? getMenuImage(msg.content) : null
                  
                  // 텍스트에서 메뉴 이름을 찾아서 hover 가능한 요소로 변환
                  const renderTextWithMenuHover = (text: string) => {
                    // 정확한 메뉴 이름 4개만 매칭 (부분 매칭 제거)
                    const menuNamePatterns = [
                      { name: '발렌타인 디너', type: MenuType.VALENTINE },
                      { name: '프렌치 디너', type: MenuType.FRENCH },
                      { name: '잉글리시 디너', type: MenuType.ENGLISH },
                      { name: '샴페인 축제 디너', type: MenuType.CHAMPAGNE_FESTIVAL },
                    ]
                    
                    // 긴 패턴부터 먼저 매칭 (예: "프렌치 디너"가 "프렌치"보다 먼저)
                    const sortedPatterns = menuNamePatterns.sort((a, b) => b.name.length - a.name.length)
                    
                    // 매칭된 부분을 추적하기 위한 배열
                    interface Match {
                      start: number
                      end: number
                      text: string
                      menu: Menu | null
                    }
                    
                    const matches: Match[] = []
                    const processedIndices = new Set<number>()
                    
                    // 모든 패턴에 대해 매칭 찾기
                    for (const pattern of sortedPatterns) {
                      const regex = new RegExp(pattern.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
                      const regexMatches = [...text.matchAll(regex)]
                      
                      for (const match of regexMatches) {
                        const start = match.index!
                        const end = start + match[0].length
                        
                        // 이미 처리된 인덱스와 겹치지 않는지 확인
                        let overlaps = false
                        for (let i = start; i < end; i++) {
                          if (processedIndices.has(i)) {
                            overlaps = true
                            break
                          }
                        }
                        
                        if (!overlaps) {
                          const menu = menus.find(m => m.type === pattern.type)
                          matches.push({
                            start,
                            end,
                            text: match[0],
                            menu: menu || null
                          })
                          
                          // 처리된 인덱스 표시
                          for (let i = start; i < end; i++) {
                            processedIndices.add(i)
                          }
                        }
                      }
                    }
                    
                    // 시작 위치로 정렬
                    matches.sort((a, b) => a.start - b.start)
                    
                    // 결과 배열 생성
                    const result: (string | JSX.Element)[] = []
                    let lastIndex = 0
                    
                    for (const match of matches) {
                      // 매칭 전 텍스트 추가
                      if (match.start > lastIndex) {
                        result.push(text.substring(lastIndex, match.start))
                      }
                      
                      // 메뉴가 있으면 hover 가능한 컴포넌트로, 없으면 일반 텍스트로
                      if (match.menu) {
                        result.push(
                          <MenuHoverTooltip
                            key={`${idx}-${match.start}`}
                            menuName={match.text}
                            menu={match.menu}
                          />
                        )
                      } else {
                        result.push(match.text)
                      }
                      
                      lastIndex = match.end
                    }
                    
                    // 남은 텍스트 추가
                    if (lastIndex < text.length) {
                      result.push(text.substring(lastIndex))
                    }
                    
                    return result.length > 0 ? result : [text]
                  }
                  
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        gap: '0.5rem'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.25rem'
                      }}>
                        <span style={{
                          fontSize: '0.875rem',
                          fontWeight: '600',
                          color: msg.role === 'user' ? '#667eea' : '#10b981'
                        }}>
                          {msg.role === 'user' ? '👤 고객' : '🤖 AI 어시스턴트'}
                        </span>
                      </div>
                      {menuImage && (
                        <div style={{
                          marginBottom: '0.5rem',
                          borderRadius: '0.75rem',
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
                          maxWidth: '300px'
                        }}>
                          <img 
                            src={menuImage} 
                            alt="메뉴 이미지"
                            style={{
                              width: '100%',
                              height: 'auto',
                              display: 'block'
                            }}
                            onError={(e) => {
                              // 이미지 로드 실패 시 숨김
                              e.currentTarget.style.display = 'none'
                            }}
                          />
                        </div>
                      )}
                      <div style={{
                        maxWidth: '80%',
                        padding: '0.875rem 1rem',
                        borderRadius: msg.role === 'user' 
                          ? '1rem 1rem 0.25rem 1rem' 
                          : '1rem 1rem 1rem 0.25rem',
                        background: msg.role === 'user'
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : '#f0fdf4',
                        color: msg.role === 'user' ? 'white' : '#1e293b',
                        boxShadow: msg.role === 'user'
                          ? '0 2px 4px rgba(102, 126, 234, 0.2)'
                          : '0 2px 4px rgba(0, 0, 0, 0.1)',
                        wordBreak: 'break-word'
                      }}>
                        <div style={{
                          margin: 0,
                          fontSize: '1rem',
                          whiteSpace: 'pre-wrap',
                          lineHeight: '1.6'
                        }}>
                          {msg.role === 'assistant' ? renderTextWithMenuHover(msg.content) : msg.content}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {/* 스크롤 위치 마커 */}
                <div ref={conversationEndRef} />
              </div>
            )}
          </div>

          {/* 주문 정보 표시 */}
          {orderSummary && (
            <div style={{
              background: 'white',
              borderRadius: '0.75rem',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              border: '2px solid #e2e8f0',
            }}>
              <p style={{
                margin: '0 0 1rem 0',
                fontSize: '1rem',
                color: '#1e293b',
                fontWeight: '600'
              }}>
                주문 정보:
              </p>
              <div style={{ color: '#64748b' }}>
                {orderSummary.menuName && <p>메뉴: {orderSummary.menuName}</p>}
                {orderSummary.menuStyle && <p>스타일: {orderSummary.menuStyle}</p>}
                {orderSummary.menuItems && <p>구성 음식: {orderSummary.menuItems}</p>}
              </div>
            </div>
          )}

          {isProcessing && <LoadingSpinner />}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '2rem' }}>
        {menus.map((menu) => (
          <Link
            key={menu.id}
            to={`/menu/${menu.id}`}
            style={{
              textDecoration: 'none',
              color: 'inherit',
              background: 'white',
              borderRadius: '1rem',
              padding: 0,
              transition: 'all 0.3s ease',
              display: 'block',
              overflow: 'hidden',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              border: '1px solid #e2e8f0'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-8px)'
              e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
            }}
          >
            <img
              src={getMenuImage(menu.type)}
              alt={getMenuName(menu.type)}
              style={{
                width: '100%',
                height: '220px',
                objectFit: 'cover',
                display: 'block'
              }}
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <div style={{ padding: '1.5rem' }}>
              <h3 style={{ 
                marginBottom: '0.75rem', 
                color: '#1e293b',
                fontSize: '1.5rem',
                fontWeight: '700'
              }}>
                {getMenuName(menu.type)}
              </h3>
              <p style={{ 
                fontSize: '1.5rem', 
                fontWeight: 'bold',
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                marginBottom: '0.5rem'
              }}>
                {menu.basePrice.toLocaleString()}원
              </p>
              <p style={{ 
                marginTop: '0.5rem', 
                color: '#64748b',
                fontSize: '0.9rem'
              }}>
                {menu.items.length}개의 구성 음식
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default MenuList
