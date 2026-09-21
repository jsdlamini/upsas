"""
A very small diagram toolkit.

The process diagrams in the handbook are generated rather than drawn, for the
same reason the mark schedule is: a picture that is redrawn by hand every time
the process changes will eventually disagree with the process. Everything here
emits plain SVG, which WeasyPrint renders as vectors, so the diagrams stay sharp
at any zoom and the PDF stays small.

Coordinates are in SVG user units; the stylesheet scales each figure to the text
column, so laying a diagram out on a 960-unit grid is comfortable regardless of
the page size it lands on.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html import escape

# The application's own section hues, so the handbook and the screens agree.
HARBOUR = "#16628C"   # dashboards, the cohort
INDIGO = "#5B43BF"    # topics
TEAL = "#0E7480"      # booking and availability
MOSS = "#1F7A5A"      # consultations
AZURE = "#2E5AC8"     # marking
PLUM = "#9B3D76"      # moderation and release
ARCHIVE = "#2C4A6B"   # reports
RUST = "#B23B35"      # refusal, blocking
OCHRE = "#8A5A12"     # caution
INK = "#0F1B2D"
MUTED = "#5A6679"
RULE = "#D7DEE7"
PAPER = "#FFFFFF"

SANS = "DejaVu Sans, Carlito, sans-serif"
MONO = "DejaVu Sans Mono, monospace"

# DejaVu Sans is close enough to this ratio for wrapping decisions.
_CHAR_W = 0.545


def wrap(text: str, width: float, size: float) -> list[str]:
    """Greedy wrap by estimated width. Explicit newlines are honoured."""
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        current = words[0]
        for word in words[1:]:
            trial = f"{current} {word}"
            if len(trial) * _CHAR_W * size <= width:
                current = trial
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def tint(hue: str, amount: float) -> str:
    """Mix `hue` toward white. Used for fills behind coloured outlines."""
    hue = hue.lstrip("#")
    r, g, b = (int(hue[i:i + 2], 16) for i in (0, 2, 4))
    mix = lambda c: round(c + (255 - c) * (1 - amount))
    return f"#{mix(r):02X}{mix(g):02X}{mix(b):02X}"



@dataclass
class Node:
    """A placed shape. Arrows attach to its edges rather than its centre, which
    is the difference between a diagram and a pile of lines crossing boxes."""
    x: float
    y: float
    w: float
    h: float
    shape: str = "rect"

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def c(self) -> tuple[float, float]:
        return (self.cx, self.cy)

    def side(self, name: str) -> tuple[float, float]:
        if name == "n":
            return (self.cx, self.y)
        if name == "s":
            return (self.cx, self.y + self.h)
        if name == "w":
            return (self.x, self.cy)
        return (self.x + self.w, self.cy)

    def toward(self, target: tuple[float, float], axis: str | None = None) -> tuple[float, float]:
        """The point on this shape's edge facing `target`."""
        dx = target[0] - self.cx
        dy = target[1] - self.cy
        if axis == "h" or (axis is None and abs(dx) / max(self.w, 1) >= abs(dy) / max(self.h, 1)):
            return self.side("e" if dx >= 0 else "w")
        return self.side("s" if dy >= 0 else "n")


def _point(thing: "Node | tuple[float, float]", target: tuple[float, float],
           axis: str | None = None) -> tuple[float, float]:
    return thing.toward(target, axis) if isinstance(thing, Node) else thing


def _centre(thing: "Node | tuple[float, float]") -> tuple[float, float]:
    return thing.c if isinstance(thing, Node) else thing


@dataclass
class Diagram:
    width: float
    height: float
    parts: list[str] = field(default_factory=list)

    # ---------------------------------------------------------------- shapes

    def lane(self, y: float, height: float, label: str, hue: str = MUTED,
             x: float = 0, width: float | None = None) -> None:
        """A swimlane band with its actor's name down the left edge."""
        width = self.width if width is None else width
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="8" '
            f'fill="{tint(hue, 0.05)}" stroke="{tint(hue, 0.28)}" stroke-width="1"/>'
        )
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="4" height="{height}" rx="2" fill="{hue}"/>'
        )
        self.parts.append(
            f'<text x="{x + 16}" y="{y + 20}" font-family="{SANS}" font-size="12.5" '
            f'font-weight="700" fill="{hue}" letter-spacing="0.4">{escape(label)}</text>'
        )

    def box(self, x: float, y: float, w: float, h: float, title: str,
            sub: str | None = None, hue: str = INK, solid: bool = False) -> Node:
        """A step. Returns its centre, which is what the arrows want."""
        fill = hue if solid else tint(hue, 0.07)
        stroke = hue
        text_colour = PAPER if solid else INK
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="1.4"/>'
        )
        title_lines = wrap(title, w - 22, 13)
        sub_lines = wrap(sub, w - 22, 11) if sub else []
        block = len(title_lines) * 16 + (len(sub_lines) * 13.5 + 4 if sub_lines else 0)
        cursor = y + (h - block) / 2 + 12.5
        for line in title_lines:
            self.parts.append(
                f'<text x="{x + w / 2}" y="{cursor}" text-anchor="middle" font-family="{SANS}" '
                f'font-size="13" font-weight="600" fill="{text_colour}">{escape(line)}</text>'
            )
            cursor += 16
        if sub_lines:
            cursor += 2
            for line in sub_lines:
                colour = "#D8E2F2" if solid else MUTED
                self.parts.append(
                    f'<text x="{x + w / 2}" y="{cursor}" text-anchor="middle" '
                    f'font-family="{SANS}" font-size="11" fill="{colour}">{escape(line)}</text>'
                )
                cursor += 13.5
        return Node(x, y, w, h)

    def gate(self, cx: float, cy: float, w: float, h: float, label: str,
             hue: str = OCHRE) -> Node:
        """A decision. Diamonds are reserved for points where the system refuses."""
        points = f"{cx},{cy - h / 2} {cx + w / 2},{cy} {cx},{cy + h / 2} {cx - w / 2},{cy}"
        self.parts.append(
            f'<polygon points="{points}" fill="{tint(hue, 0.09)}" stroke="{hue}" stroke-width="1.4"/>'
        )
        lines = wrap(label, w - 46, 11.5)
        cursor = cy - (len(lines) - 1) * 7
        for line in lines:
            self.parts.append(
                f'<text x="{cx}" y="{cursor + 4}" text-anchor="middle" font-family="{SANS}" '
                f'font-size="11.5" font-weight="600" fill="{INK}">{escape(line)}</text>'
            )
            cursor += 14
        return Node(cx - w / 2, cy - h / 2, w, h, shape="diamond")

    def pill(self, cx: float, cy: float, label: str, hue: str = MOSS) -> Node:
        w = max(74.0, len(label) * 7.2 + 26)
        h = 28.0
        self.parts.append(
            f'<rect x="{cx - w / 2}" y="{cy - h / 2}" width="{w}" height="{h}" rx="14" '
            f'fill="{tint(hue, 0.12)}" stroke="{hue}" stroke-width="1.3"/>'
        )
        self.parts.append(
            f'<text x="{cx}" y="{cy + 4.5}" text-anchor="middle" font-family="{SANS}" '
            f'font-size="12" font-weight="600" fill="{hue}">{escape(label)}</text>'
        )
        return Node(cx - w / 2, cy - h / 2, w, h, shape="pill")

    def note(self, x: float, y: float, w: float, text: str, hue: str = MUTED) -> float:
        """Marginal commentary: why a step is there, not what it does."""
        lines = wrap(text, w - 18, 10.8)
        h = len(lines) * 14 + 16
        self.parts.append(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#FFFFFF" '
            f'stroke="{tint(hue, 0.35)}" stroke-width="1" stroke-dasharray="3 3"/>'
        )
        cursor = y + 18
        for line in lines:
            self.parts.append(
                f'<text x="{x + 9}" y="{cursor}" font-family="{SANS}" font-size="10.8" '
                f'fill="{MUTED}">{escape(line)}</text>'
            )
            cursor += 14
        return h

    def caption(self, x: float, y: float, text: str, hue: str = MUTED,
                size: float = 11, weight: int = 400, anchor: str = "start") -> None:
        self.parts.append(
            f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{SANS}" '
            f'font-size="{size}" font-weight="{weight}" fill="{hue}">{escape(text)}</text>'
        )

    # ---------------------------------------------------------------- links

    def arrow(self, start, end, label: str | None = None, hue: str = MUTED,
              dashed: bool = False, elbow: str | None = None,
              label_side: str = "above", via: float | None = None) -> None:
        """
        A connector between two shapes, or two raw points.

        Given shapes, it leaves and enters through edges rather than centres, so
        a line never runs across the box it starts in. `elbow` routes
        orthogonally: 'hv' across then down, 'vh' down then across, and
        'hvh'/'vhv' out into a channel at `via` and back, for the long
        connectors that would otherwise cut through everything between.
        """
        s_c, e_c = _centre(start), _centre(end)
        if elbow in ("hv", "hvh"):
            x1, y1 = _point(start, e_c, "h")
            x2, y2 = _point(end, s_c, "v" if elbow == "hv" else "h")
        elif elbow in ("vh", "vhv"):
            x1, y1 = _point(start, e_c, "v")
            x2, y2 = _point(end, s_c, "h" if elbow == "vh" else "v")
        else:
            x1, y1 = _point(start, e_c)
            x2, y2 = _point(end, s_c)

        dash = ' stroke-dasharray="5 4"' if dashed else ""
        if elbow == "hv":
            path = f"M {x1} {y1} L {x2} {y1} L {x2} {y2}"
        elif elbow == "vh":
            path = f"M {x1} {y1} L {x1} {y2} L {x2} {y2}"
        elif elbow == "hvh":
            channel = via if via is not None else (x1 + x2) / 2
            path = f"M {x1} {y1} L {channel} {y1} L {channel} {y2} L {x2} {y2}"
        elif elbow == "vhv":
            channel = via if via is not None else (y1 + y2) / 2
            path = f"M {x1} {y1} L {x1} {channel} L {x2} {channel} L {x2} {y2}"
        else:
            path = f"M {x1} {y1} L {x2} {y2}"
        self.parts.append(
            f'<path d="{path}" fill="none" stroke="{hue}" stroke-width="1.5"{dash} '
            f'marker-end="url(#head-{hue.lstrip("#")})"/>'
        )
        self._marker(hue)
        if label:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if elbow == "hv":
                mx, my = (x1 + x2) / 2, y1
            elif elbow == "vh":
                mx, my = x1, (y1 + y2) / 2
            elif elbow == "hvh":
                mx, my = (via if via is not None else (x1 + x2) / 2), (y1 + y2) / 2
            elif elbow == "vhv":
                mx, my = (x1 + x2) / 2, (via if via is not None else (y1 + y2) / 2)
            dy = -7 if label_side == "above" else 15
            width = len(label) * 6.1 + 10
            self.parts.append(
                f'<rect x="{mx - width / 2}" y="{my + dy - 10}" width="{width}" height="14" '
                f'rx="3" fill="#FFFFFF" opacity="0.92"/>'
            )
            self.parts.append(
                f'<text x="{mx}" y="{my + dy}" text-anchor="middle" font-family="{SANS}" '
                f'font-size="10.5" font-weight="600" fill="{hue}">{escape(label)}</text>'
            )

    _markers: set[str] = field(default_factory=set)

    def _marker(self, hue: str) -> None:
        self._markers.add(hue)

    # ---------------------------------------------------------------- output

    def svg(self) -> str:
        defs = "".join(
            f'<marker id="head-{hue.lstrip("#")}" viewBox="0 0 10 10" refX="8.5" refY="5" '
            f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M 0 1 L 9 5 L 0 9 z" fill="{hue}"/></marker>'
            for hue in sorted(self._markers)
        )
        body = "".join(self.parts)
        return (
            f'<svg class="figure" viewBox="0 0 {self.width} {self.height}" '
            f'xmlns="http://www.w3.org/2000/svg" role="img">'
            f"<defs>{defs}</defs>{body}</svg>"
        )
