import type { ReactNode } from "react";
import Lightbox, {
  stopNavigationEventsPropagation,
  useController,
  useLightboxState,
  useLoseFocus,
  useNavigationState,
  type Slide,
} from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Video from "yet-another-react-lightbox/plugins/video";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import {
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Maximize,
  Minus,
  Play,
  Plus,
  Video as VideoIcon,
  X,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MediaSlide } from "@/hooks/use-media-lightbox";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

/** One toolbar action, supplied by the caller (copy, reply, forward, …). */
export interface LightboxAction {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

/** Last path segment, for slides that carry no name. */
const baseName = (url: string) => url.split(/[?#]/)[0].split("/").pop() || "Media";

const slideTitle = (slide?: MediaSlide) =>
  slide?.mediaName || (slide?.mediaPath ? baseName(slide.mediaPath) : "Media");

/**
 * The chat's media viewer: a blurred backdrop, a title band naming the file and
 * its place in the set, square glass controls, and a thumbnail strip once there
 * is more than one slide to page between.
 *
 * Kept in its own module so chat-area can lazy-load it together with the
 * library — the actions are passed as data rather than as elements built with
 * this module's buttons.
 */
export default function MediaLightbox({
  slides,
  index,
  onIndexChange,
  onClose,
  actions,
}: {
  slides: MediaSlide[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  actions: LightboxAction[];
}) {
  const many = slides.length > 1;
  // Phones get a tighter frame — the desktop inset would eat a third of the
  // screen. Read per render; the viewer remounts on every open anyway.
  const phone = window.matchMedia("(max-width: 639px)").matches;

  return (
    <Lightbox
      open
      close={onClose}
      index={index}
      slides={slides as unknown as Slide[]}
      on={{ view: ({ index: next }) => onIndexChange(next) }}
      plugins={many ? [Video, Zoom, Thumbnails] : [Video, Zoom]}
      className="xl-lightbox"
      // The padding keeps the slide clear of the title band and the strip.
      carousel={{ finite: true, padding: phone ? "56px" : "76px", imageFit: "contain" }}
      // Only the close button (or Esc) closes the viewer — a stray click on the
      // backdrop while paging through media should not throw the user out.
      controller={{ closeOnBackdropClick: false }}
      thumbnails={phone
        ? { width: 64, height: 48, border: 0, gap: 6, padding: 2 }
        : { width: 96, height: 72, border: 0, gap: 8, padding: 4 }}
      zoom={{ maxZoomPixelRatio: 4, scrollToZoom: true }}
      animation={{ fade: 200, swipe: 350 }}
      toolbar={{
        buttons: [
          "zoom",
          ...actions.map((a) => (
            <LightboxButton key={a.key} label={a.label} onClick={a.onClick}>
              {a.icon}
            </LightboxButton>
          )),
          <CloseButton key="close" />,
        ],
      }}
      render={{
        buttonPrev: many ? () => <NavButton action="prev" /> : () => null,
        buttonNext: many ? () => <NavButton action="next" /> : () => null,
        buttonZoom: (zoom) => <ZoomControls zoom={zoom} />,
        controls: () => <TitleBar count={slides.length} />,
        // A video with no poster has nothing for the strip to paint.
        thumbnail: ({ slide }) =>
          slide.type === "video" && !(slide as unknown as MediaSlide).poster ? (
            <span className="grid size-full place-items-center rounded-md bg-white/10 text-white/70">
              <Play className="size-6" />
            </span>
          ) : undefined,
      }}
    />
  );
}

/**
 * One control of the viewer. Pointer and key events stop here so reaching for
 * a button never swipes the carousel or closes it via the backdrop.
 */
function LightboxButton({
  label,
  side = "bottom",
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { focus } = useController();
  const loseFocus = useLoseFocus(focus, disabled);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("yarl__button", className)}
          disabled={disabled}
          onClick={onClick}
          {...stopNavigationEventsPropagation()}
          {...loseFocus}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

function NavButton({ action }: { action: "prev" | "next" }) {
  const { prev, next } = useController();
  const { prevDisabled, nextDisabled } = useNavigationState();
  const isPrev = action === "prev";

  return (
    <LightboxButton
      label={isPrev ? "Previous" : "Next"}
      side={isPrev ? "right" : "left"}
      onClick={isPrev ? prev : next}
      disabled={isPrev ? prevDisabled : nextDisabled}
      className={`yarl__navigation_${action}`}
    >
      {isPrev ? <ChevronLeft className="size-5" /> : <ChevronRight className="size-5" />}
    </LightboxButton>
  );
}

function CloseButton() {
  const { close } = useController();
  return (
    <LightboxButton label="Close" onClick={close}>
      <X className="size-5" />
    </LightboxButton>
  );
}

/**
 * Zoom out / level / in. The percentage doubles as "reset to fit". Hidden on a
 * video slide, where zoom does nothing.
 */
function ZoomControls({
  zoom,
}: {
  zoom: {
    zoom: number;
    minZoom: number;
    maxZoom: number;
    disabled: boolean;
    zoomIn: () => void;
    zoomOut: () => void;
    changeZoom: (value: number) => void;
  };
}) {
  if (zoom.disabled) return null;

  return (
    <>
      <LightboxButton label="Zoom out" className="xl-lightbox__zoom-step" onClick={zoom.zoomOut} disabled={zoom.zoom <= zoom.minZoom}>
        <Minus className="size-5" />
      </LightboxButton>
      <LightboxButton
        label="Reset zoom"
        onClick={() => zoom.changeZoom(zoom.minZoom)}
        disabled={zoom.zoom <= zoom.minZoom}
        className="xl-lightbox__zoom xl-lightbox__zoom-step"
      >
        <Maximize className="size-3.5" />
        {Math.round(zoom.zoom * 100)}%
      </LightboxButton>
      <LightboxButton label="Zoom in" className="xl-lightbox__zoom-step" onClick={zoom.zoomIn} disabled={zoom.zoom >= zoom.maxZoom}>
        <Plus className="size-5" />
      </LightboxButton>
    </>
  );
}

/** Top-left band: what you're looking at, and where you are in the set. */
function TitleBar({ count }: { count: number }) {
  const { currentSlide, currentIndex } = useLightboxState();
  const slide = currentSlide as MediaSlide | undefined;

  return (
    <div className="xl-lightbox__title">
      <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[rgba(20,20,24,0.55)] text-white/90 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/12 backdrop-blur-md">
        {slide?.type === "video" ? <VideoIcon className="size-4" /> : <ImageIcon className="size-4" />}
      </span>
      <span className="min-w-0 truncate text-sm font-medium text-white/95 [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">{slideTitle(slide)}</span>
      {count > 1 && (
        <span className="shrink-0 rounded-full bg-[rgba(20,20,24,0.55)] px-2.5 py-1 text-xs font-medium tabular-nums text-white/90 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.6)] ring-1 ring-inset ring-white/12 backdrop-blur-md">
          {currentIndex + 1} / {count}
        </span>
      )}
    </div>
  );
}
