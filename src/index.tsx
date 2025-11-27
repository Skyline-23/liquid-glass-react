import { type CSSProperties, forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { ShaderDisplacementGenerator, fragmentShaders } from "./shader-utils"
import { displacementMap, polarDisplacementMap, prominentDisplacementMap } from "./utils"

// Generate shader-based displacement map using shaderUtils
const generateShaderDisplacementMap = (width: number, height: number): string => {
  const generator = new ShaderDisplacementGenerator({
    width,
    height,
    fragment: fragmentShaders.liquidGlass,
  })

  const dataUrl = generator.updateShader()
  generator.destroy()

  return dataUrl
}

const getMap = (mode: "standard" | "polar" | "prominent" | "shader", shaderMapUrl?: string) => {
  switch (mode) {
    case "standard":
      return displacementMap
    case "polar":
      return polarDisplacementMap
    case "prominent":
      return prominentDisplacementMap
    case "shader":
      return shaderMapUrl || displacementMap
    default:
      throw new Error(`Invalid mode: ${mode}`)
  }
}

/* ---------- SVG filter (edge-only displacement) ---------- */
const GlassFilter: React.FC<{ id: string; displacementScale: number; aberrationIntensity: number; width: number; height: number; mode: "standard" | "polar" | "prominent" | "shader"; shaderMapUrl?: string }> = ({
  id,
  displacementScale,
  aberrationIntensity,
  width,
  height,
  mode,
  shaderMapUrl,
}) => (
  <svg style={{ position: "absolute", width, height }} aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-edge-mask`} cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="black" stopOpacity="0" />
        <stop offset={`${Math.max(30, 80 - aberrationIntensity * 2)}%`} stopColor="black" stopOpacity="0" />
        <stop offset="100%" stopColor="white" stopOpacity="1" />
      </radialGradient>
      <filter
        id={id}
        x={-width * 0.1}
        y={-height * 0.1}
        width={width * 1.2}
        height={height * 1.2}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage id="feimage" x="0" y="0" width="100%" height="100%" result="DISPLACEMENT_MAP" href={getMap(mode, shaderMapUrl)} preserveAspectRatio="xMidYMid slice" />

        {/* Create edge mask using the displacement map itself */}
        <feColorMatrix
          in="DISPLACEMENT_MAP"
          type="matrix"
          values="0.3 0.3 0.3 0 0
                 0.3 0.3 0.3 0 0
                 0.3 0.3 0.3 0 0
                 0 0 0 1 0"
          result="EDGE_INTENSITY"
        />
        <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
          <feFuncA type="discrete" tableValues={`0 ${aberrationIntensity * 0.05} 1`} />
        </feComponentTransfer>

        {/* Original undisplaced image for center */}
        <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />

        {/* Red channel displacement with slight offset */}
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={displacementScale * (mode === "shader" ? 1 : -1)} xChannelSelector="R" yChannelSelector="B" result="RED_DISPLACED" />
        <feColorMatrix
          in="RED_DISPLACED"
          type="matrix"
          values="1 0 0 0 0
                 0 0 0 0 0
                 0 0 0 0 0
                 0 0 0 1 0"
          result="RED_CHANNEL"
        />

        {/* Green channel displacement */}
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={displacementScale * ((mode === "shader" ? 1 : -1) - aberrationIntensity * 0.05)} xChannelSelector="R" yChannelSelector="B" result="GREEN_DISPLACED" />
        <feColorMatrix
          in="GREEN_DISPLACED"
          type="matrix"
          values="0 0 0 0 0
                 0 1 0 0 0
                 0 0 0 0 0
                 0 0 0 1 0"
          result="GREEN_CHANNEL"
        />

        {/* Blue channel displacement with slight offset */}
        <feDisplacementMap in="SourceGraphic" in2="DISPLACEMENT_MAP" scale={displacementScale * ((mode === "shader" ? 1 : -1) - aberrationIntensity * 0.1)} xChannelSelector="R" yChannelSelector="B" result="BLUE_DISPLACED" />
        <feColorMatrix
          in="BLUE_DISPLACED"
          type="matrix"
          values="0 0 0 0 0
                 0 0 0 0 0
                 0 0 1 0 0
                 0 0 0 1 0"
          result="BLUE_CHANNEL"
        />

        {/* Combine all channels with screen blend mode for chromatic aberration */}
        <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
        <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />

        {/* Add slight blur to soften the aberration effect */}
        <feGaussianBlur in="RGB_COMBINED" stdDeviation={Math.max(0.1, 0.5 - aberrationIntensity * 0.1)} result="ABERRATED_BLURRED" />

        {/* Apply edge mask to aberration effect */}
        <feComposite in="ABERRATED_BLURRED" in2="EDGE_MASK" operator="in" result="EDGE_ABERRATION" />

        {/* Create inverted mask for center */}
        <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feComposite in="CENTER_ORIGINAL" in2="INVERTED_MASK" operator="in" result="CENTER_CLEAN" />

        {/* Combine edge aberration with clean center */}
        <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
      </filter>
    </defs>
  </svg>
)

/* ---------- container ---------- */
const GlassContainer = forwardRef<
  HTMLDivElement,
  React.PropsWithChildren<{
    className?: string
    style?: React.CSSProperties
    displacementScale?: number
    blurAmount?: number
    saturation?: number
    aberrationIntensity?: number
    mouseOffset?: { x: number; y: number }
    onMouseLeave?: () => void
    onMouseEnter?: () => void
    onMouseDown?: () => void
    onMouseUp?: () => void
    active?: boolean
    overLight?: boolean
    cornerRadius?: number
    padding?: string
    glassSize?: { width: number; height: number }
    onClick?: () => void
    mode?: "standard" | "polar" | "prominent" | "shader"
    filterIdRef?: React.MutableRefObject<string | null> | null
  }>
>(
  (
    {
      children,
      className = "",
      style,
      displacementScale = 25,
      blurAmount = 12,
      saturation = 180,
      aberrationIntensity = 2,
      onMouseEnter,
      onMouseLeave,
      onMouseDown,
      onMouseUp,
      active = false,
      overLight = false,
      cornerRadius = 999,
      padding = "24px 32px",
      glassSize = { width: 270, height: 69 },
      onClick,
      mode = "standard",
      filterIdRef = null,
    },
    ref,
  ) => {
    const filterId = useId()
    useEffect(() => {
      if (filterIdRef) {
        filterIdRef.current = filterId
      }
    }, [filterId, filterIdRef])
    const [shaderMapUrl, setShaderMapUrl] = useState<string>("")

    const isFirefox = navigator.userAgent.toLowerCase().includes("firefox")

    // Generate shader displacement map when in shader mode
    useEffect(() => {
      if (mode === "shader") {
        const url = generateShaderDisplacementMap(glassSize.width, glassSize.height)
        setShaderMapUrl(url)
      }
    }, [mode, glassSize.width, glassSize.height])

    const backdropStyle = {
      filter: isFirefox ? null : `url(#${filterId})`,
      backdropFilter: `blur(${(overLight ? 12 : 4) + blurAmount * 32}px) saturate(${saturation}%)`,
    }

    const outerShadow = overLight ? "0px 8px 24px rgba(0, 0, 0, 0.12)" : "0px 12px 40px rgba(0, 0, 0, 0.25)"

    return (
      <div
        ref={ref}
        className={`relative ${className} ${active ? "active" : ""} ${Boolean(onClick) ? "cursor-pointer" : ""}`}
        style={{ ...style, overflow: "visible", boxShadow: (style as CSSProperties)?.boxShadow ?? outerShadow, borderRadius: `${cornerRadius}px` }}
        onClick={onClick}
      >
        <GlassFilter mode={mode} id={filterId} displacementScale={displacementScale} aberrationIntensity={aberrationIntensity} width={glassSize.width} height={glassSize.height} shaderMapUrl={shaderMapUrl} />

        <div
          className="glass"
          style={{
            borderRadius: `${cornerRadius}px`,
            position: "relative",
            display: (style as React.CSSProperties).display ?? "inline-flex",
            alignItems: (style as React.CSSProperties).alignItems ?? "center",
            gap: "24px",
            padding,
            overflow: (style as React.CSSProperties).overflow ?? "hidden",
            transition: "all 0.2s ease-in-out",
            boxShadow: "none",
            width: (style as React.CSSProperties).width ?? "fit-content",
            height: (style as React.CSSProperties).height ?? "auto",
          }}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
        >
          {/* backdrop layer that gets wiggly */}
          <span
            className="glass__warp"
            style={
              {
                ...backdropStyle,
                position: "absolute",
                inset: "0",
              } as CSSProperties
            }
          />

          {/* user content stays sharp */}
          <div
            className="transition-all duration-150 ease-in-out text-white"
            style={{
              position: "relative",
              zIndex: 1,
              font: "500 20px/1 system-ui",
              textShadow: overLight ? "0px 2px 12px rgba(0, 0, 0, 0)" : "0px 2px 12px rgba(0, 0, 0, 0.4)",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    )
  },
)

GlassContainer.displayName = "GlassContainer"

interface LiquidGlassProps {
  children: React.ReactNode
  displacementScale?: number
  blurAmount?: number
  saturation?: number
  aberrationIntensity?: number
  elasticity?: number
  cornerRadius?: number
  globalMousePos?: { x: number; y: number }
  mouseOffset?: { x: number; y: number }
  mouseContainer?: React.RefObject<HTMLElement | null> | null
  className?: string
  padding?: string
  style?: React.CSSProperties
  overLight?: boolean
  mode?: "standard" | "polar" | "prominent" | "shader"
  onClick?: () => void
  containerRef?: React.MutableRefObject<HTMLDivElement | null> | null
  centered?: boolean
  axisCenter?: "both" | "x" | "y" | "none"
  glassSize?: { width: number; height: number }
}

export default function LiquidGlass({
  children,
  displacementScale = 70,
  blurAmount = 0.0625,
  saturation = 140,
  aberrationIntensity = 2,
  elasticity = 0.15,
  cornerRadius = 999,
  globalMousePos: externalGlobalMousePos,
  mouseOffset: externalMouseOffset,
  mouseContainer = null,
  className = "",
  padding = "24px 32px",
  overLight = false,
  style = {},
  mode = "standard",
  onClick,
  containerRef = null,
  centered = true,
  axisCenter = "both",
  glassSize: externalGlassSize,
}: LiquidGlassProps) {
  const glassRef = useRef<HTMLDivElement>(null)
  const overlayWrapperRef = useRef<HTMLDivElement>(null)
  const borderSpanRef = useRef<HTMLSpanElement>(null)
  const filterIdRef = useRef<string | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const [isActive, setIsActive] = useState(false)
  const [glassSize, setGlassSize] = useState(externalGlassSize ?? { width: 270, height: 69 })
  const [internalGlobalMousePos, setInternalGlobalMousePos] = useState({ x: 0, y: 0 })
  const [internalMouseOffset, setInternalMouseOffset] = useState({ x: 0, y: 0 })

  // Use external mouse position if provided, otherwise use internal
  const globalMousePos = externalGlobalMousePos || internalGlobalMousePos
  const mouseOffset = externalMouseOffset || internalMouseOffset

  // Internal mouse tracking
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = mouseContainer?.current || glassRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      setInternalMouseOffset({
        x: ((e.clientX - centerX) / rect.width) * 100,
        y: ((e.clientY - centerY) / rect.height) * 100,
      })

      setInternalGlobalMousePos({
        x: e.clientX,
        y: e.clientY,
      })
    },
    [mouseContainer],
  )

  // Set up mouse tracking if no external mouse position is provided
  useEffect(() => {
    if (externalGlobalMousePos && externalMouseOffset) {
      // External mouse tracking is provided, don't set up internal tracking
      return
    }

    const container = mouseContainer?.current || glassRef.current
    if (!container) {
      return
    }

    container.addEventListener("mousemove", handleMouseMove)

    return () => {
      container.removeEventListener("mousemove", handleMouseMove)
    }
  }, [handleMouseMove, mouseContainer, externalGlobalMousePos, externalMouseOffset])

  // Calculate directional scaling based on mouse position
  const calculateDirectionalScale = useCallback(() => {
    if (!globalMousePos.x || !globalMousePos.y || !glassRef.current) {
      return "scale(1)"
    }

    const rect = glassRef.current.getBoundingClientRect()
    const pillCenterX = rect.left + rect.width / 2
    const pillCenterY = rect.top + rect.height / 2
    const pillWidth = glassSize.width
    const pillHeight = glassSize.height

    const deltaX = globalMousePos.x - pillCenterX
    const deltaY = globalMousePos.y - pillCenterY

    // Calculate distance from mouse to pill edges (not center)
    const edgeDistanceX = Math.max(0, Math.abs(deltaX) - pillWidth / 2)
    const edgeDistanceY = Math.max(0, Math.abs(deltaY) - pillHeight / 2)
    const edgeDistance = Math.sqrt(edgeDistanceX * edgeDistanceX + edgeDistanceY * edgeDistanceY)

    // Activation zone: 200px from edges
    const activationZone = 200

    // If outside activation zone, no effect
    if (edgeDistance > activationZone) {
      return "scale(1)"
    }

    // Calculate fade-in factor (1 at edge, 0 at activation zone boundary)
    const fadeInFactor = 1 - edgeDistance / activationZone

    // Normalize the deltas for direction
    const centerDistance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)
    if (centerDistance === 0) {
      return "scale(1)"
    }

    const normalizedX = deltaX / centerDistance
    const normalizedY = deltaY / centerDistance

    // Calculate stretch factors with fade-in
    const stretchIntensity = Math.min(centerDistance / 300, 1) * elasticity * fadeInFactor

    // X-axis scaling: stretch horizontally when moving left/right, compress when moving up/down
    const scaleX = 1 + Math.abs(normalizedX) * stretchIntensity * 0.3 - Math.abs(normalizedY) * stretchIntensity * 0.15

    // Y-axis scaling: stretch vertically when moving up/down, compress when moving left/right
    const scaleY = 1 + Math.abs(normalizedY) * stretchIntensity * 0.3 - Math.abs(normalizedX) * stretchIntensity * 0.15

    return `scaleX(${Math.max(0.8, scaleX)}) scaleY(${Math.max(0.8, scaleY)})`
  }, [globalMousePos, elasticity, glassSize])

  // Helper function to calculate fade-in factor based on distance from element edges
  const calculateFadeInFactor = useCallback(() => {
    if (!globalMousePos.x || !globalMousePos.y || !glassRef.current) {
      return 0
    }

    const rect = glassRef.current.getBoundingClientRect()
    const pillCenterX = rect.left + rect.width / 2
    const pillCenterY = rect.top + rect.height / 2
    const pillWidth = glassSize.width
    const pillHeight = glassSize.height

    const edgeDistanceX = Math.max(0, Math.abs(globalMousePos.x - pillCenterX) - pillWidth / 2)
    const edgeDistanceY = Math.max(0, Math.abs(globalMousePos.y - pillCenterY) - pillHeight / 2)
    const edgeDistance = Math.sqrt(edgeDistanceX * edgeDistanceX + edgeDistanceY * edgeDistanceY)

    const activationZone = 200
    return edgeDistance > activationZone ? 0 : 1 - edgeDistance / activationZone
  }, [globalMousePos, glassSize])

  // Helper function to calculate elastic translation
  const calculateElasticTranslation = useCallback(() => {
    if (!glassRef.current) {
      return { x: 0, y: 0 }
    }

    const fadeInFactor = calculateFadeInFactor()
    const rect = glassRef.current.getBoundingClientRect()
    const pillCenterX = rect.left + rect.width / 2
    const pillCenterY = rect.top + rect.height / 2

    return {
      x: (globalMousePos.x - pillCenterX) * elasticity * 0.1 * fadeInFactor,
      y: (globalMousePos.y - pillCenterY) * elasticity * 0.1 * fadeInFactor,
    }
  }, [globalMousePos, elasticity, calculateFadeInFactor])

  const measureGlassSize = useCallback(() => {
    if (externalGlassSize) {
      return
    }

    const glassEl = glassRef.current?.querySelector<HTMLElement>(".glass")
    if (!glassEl) return

    const rect = glassEl.getBoundingClientRect()
    const next = { width: rect.width, height: rect.height }

    setGlassSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next))
  }, [externalGlassSize])

  // Ensure the measured size matches the actual glass content, not the initial default.
  useLayoutEffect(() => {
    measureGlassSize()
  }, [measureGlassSize, children, padding])

  // Update glass size on resize/rehydration; respect externally provided sizes.
  useEffect(() => {
    if (externalGlassSize) {
      setGlassSize(externalGlassSize)
      return
    }

    if (typeof window === "undefined") return

    measureGlassSize()
    const handleResize = () => measureGlassSize()
    window.addEventListener("resize", handleResize)

    let observer: ResizeObserver | null = null
    const glassEl = glassRef.current?.querySelector<HTMLElement>(".glass")
    if (glassEl && "ResizeObserver" in window) {
      observer = new ResizeObserver(() => measureGlassSize())
      observer.observe(glassEl)
    }

    return () => {
      window.removeEventListener("resize", handleResize)
      if (observer) observer.disconnect()
    }
  }, [externalGlassSize, measureGlassSize])

  useEffect(() => {
    if (externalGlassSize) {
      setGlassSize(externalGlassSize)
    }
  }, [externalGlassSize?.width, externalGlassSize?.height])

  const elastic = calculateElasticTranslation()
  const dynamicTransform = `${isActive && Boolean(onClick) ? "scale(0.96)" : calculateDirectionalScale()} translate(${elastic.x}px, ${elastic.y}px)`.trim()
  const callerTransform = (style as React.CSSProperties).transform
  const appliedTransform = dynamicTransform

  // Apply transform to glass/overlays; wrapper handles positioning
  const baseStyle: React.CSSProperties = {
    ...style,
    position: "relative",
    top: undefined,
    left: undefined,
    right: undefined,
    bottom: undefined,
    transform: appliedTransform,
    transition: style.transition ?? "all ease-out 0.2s",
  }

  const wrapperPosition: React.CSSProperties = {
    top: (style as React.CSSProperties).top,
    left: (style as React.CSSProperties).left,
    right: (style as React.CSSProperties).right,
    bottom: (style as React.CSSProperties).bottom,
  }

  const wrapperStyle: React.CSSProperties = {
    position: (style as React.CSSProperties).position || "relative",
    display: (style as React.CSSProperties).display ?? "inline-flex",
    width: style.width ?? "fit-content",
    height: style.height,
    ...wrapperPosition,
    transform: callerTransform,
  }

  const overlayWrapperStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    transition: baseStyle.transition,
    transform: appliedTransform,
    width: "100%",
    height: "100%",
  }

  // Border frame sized to measured glass for consistent glint/mask.
  const overlayFrameStyles: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    borderRadius: `${cornerRadius}px`,
    transition: baseStyle.transition,
    boxSizing: "border-box",
    boxShadow: "0 0 0 0.5px rgba(255, 255, 255, 0.5) inset, 0 1px 3px rgba(255, 255, 255, 0.25) inset, 0 1px 4px rgba(0, 0, 0, 0.35)",
    pointerEvents: "none",
  }

  useEffect(() => {
    const glassRect = glassRef.current?.getBoundingClientRect()
    const borderRect = borderSpanRef.current?.getBoundingClientRect()
    const overlayRect = overlayWrapperRef.current?.getBoundingClientRect()
    const borderStyle = borderSpanRef.current ? window.getComputedStyle(borderSpanRef.current) : null
    // eslint-disable-next-line no-console
    console.log(`[LiquidGlass debug:${className || "unnamed"}]`, {
      glassSize,
      transform: baseStyle.transform,
      rects: { glass: glassRect, overlayWrapper: overlayRect, border: borderRect },
      offsets: borderRect && glassRect ? {
        dx: Math.round((borderRect.x - glassRect.x) * 100) / 100,
        dy: Math.round((borderRect.y - glassRect.y) * 100) / 100,
        dWidth: Math.round((borderRect.width - glassRect.width) * 100) / 100,
        dHeight: Math.round((borderRect.height - glassRect.height) * 100) / 100,
      } : null,
      borderStyle: borderStyle ? {
        width: borderStyle.width,
        height: borderStyle.height,
        inset: `${borderStyle.top} ${borderStyle.right} ${borderStyle.bottom} ${borderStyle.left}`,
        borderRadius: borderStyle.borderRadius,
        mixBlendMode: borderStyle.mixBlendMode,
        boxShadow: borderStyle.boxShadow,
        opacity: borderStyle.opacity,
      } : null,
    })
  }, [
    className,
    baseStyle.transform,
    glassSize.width,
    glassSize.height,
  ])

  return (
    <div
      ref={(node) => {
        if (containerRef) containerRef.current = node
      }}
      style={{ ...wrapperStyle }}
      className={className}
    >
      {overLight && (
        <div className="pointer-events-none absolute inset-0" style={{ ...overlayWrapperStyle, zIndex: 0 }}>
          <div
            className="transition-all duration-150 ease-in-out"
            style={{
              ...overlayFrameStyles,
              background: "transparent",
              mixBlendMode: "normal",
              opacity: 1,
              boxShadow: "0 0 0 0.75px rgba(255, 255, 255, 0.6), 0 1px 3px 0 rgba(255, 255, 255, 0.25) inset, 0 1px 4px 0 rgba(0, 0, 0, 0.25)",
            }}
          />
          <div
            className="transition-all duration-150 ease-in-out mix-blend-overlay"
            style={{
              ...overlayFrameStyles,
              background: "transparent",
              mixBlendMode: "overlay",
              opacity: 1,
              boxShadow: "0 0 0 0.75px rgba(255, 255, 255, 0.6), 0 1px 3px 0 rgba(255, 255, 255, 0.25) inset, 0 1px 4px 0 rgba(0, 0, 0, 0.25)",
            }}
          />
        </div>
      )}

      <GlassContainer
        ref={glassRef}
        className={className}
        style={baseStyle}
        cornerRadius={cornerRadius}
        displacementScale={overLight ? displacementScale * 0.5 : displacementScale}
        blurAmount={blurAmount}
        saturation={saturation}
        aberrationIntensity={aberrationIntensity}
        glassSize={glassSize}
        padding={padding}
        mouseOffset={mouseOffset}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onMouseDown={() => setIsActive(true)}
        onMouseUp={() => setIsActive(false)}
        active={isActive}
        overLight={overLight}
        onClick={onClick}
        mode={mode}
        filterIdRef={filterIdRef}
      >
        {children}
      </GlassContainer>

      <div className="pointer-events-none absolute inset-0" style={{ ...overlayWrapperStyle, zIndex: 10 }} ref={overlayWrapperRef}>
        <span
          style={{
            ...overlayFrameStyles,
            mixBlendMode: "screen",
            opacity: 0.2,
            padding: "1.5px",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            background: `linear-gradient(
            ${135 + mouseOffset.x * 1.2}deg,
            rgba(255, 255, 255, 0.0) 0%,
            rgba(255, 255, 255, ${(0.12 + Math.abs(mouseOffset.x) * 0.008)}) ${Math.max(10, 33 + mouseOffset.y * 0.3)}%,
            rgba(255, 255, 255, ${(0.4 + Math.abs(mouseOffset.x) * 0.012)}) ${Math.min(90, 66 + mouseOffset.y * 0.4)}%,
            rgba(255, 255, 255, 0.0) 100%
          )`,
          }}
        />

        <span
          ref={borderSpanRef}
          style={{
            ...overlayFrameStyles,
            mixBlendMode: "overlay",
            padding: "1.5px",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            maskComposite: "exclude",
            background: `linear-gradient(
            ${135 + mouseOffset.x * 1.2}deg,
            rgba(255, 255, 255, 0.0) 0%,
            rgba(255, 255, 255, ${(0.32 + Math.abs(mouseOffset.x) * 0.008)}) ${Math.max(10, 33 + mouseOffset.y * 0.3)}%,
            rgba(255, 255, 255, ${(0.6 + Math.abs(mouseOffset.x) * 0.012)}) ${Math.min(90, 66 + mouseOffset.y * 0.4)}%,
            rgba(255, 255, 255, 0.0) 100%
          )`,
          }}
        />

        {/* Hover pulse (optional) */}
        {Boolean(onClick) && (
          <>
            <span
              style={{
                ...overlayFrameStyles,
                opacity: isHovered || isActive ? 0.5 : 0,
                backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.5) 0%, rgba(255, 255, 255, 0) 50%)",
                mixBlendMode: "overlay",
              }}
            />
            <span
              style={{
                ...overlayFrameStyles,
                opacity: isActive ? 0.5 : 0,
                backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 80%)",
                mixBlendMode: "overlay",
              }}
            />
            <span
              style={{
                ...overlayFrameStyles,
                opacity: isHovered ? 0.4 : isActive ? 0.8 : 0,
                backgroundImage: "radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 100%)",
                mixBlendMode: "overlay",
              }}
            />
          </>
        )}
      </div>
    </div>
  )
}
