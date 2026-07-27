import { clsx, type ClassValue } from 'clsx'

// 조건부 Tailwind 클래스들을 합치고 충돌하는 유틸리티 클래스를 정리합니다.
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
