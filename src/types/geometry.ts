export interface PxBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** DOMRect 또는 테스트용 plain object */
export type ClientRectLike = Pick<DOMRectReadOnly, 'left' | 'top' | 'width' | 'height'>;
