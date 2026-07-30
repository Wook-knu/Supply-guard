"""
조달 검토 워크스페이스 라우터 (노션/칸반식).
- 보드:  POST/GET /boards, GET/PATCH/DELETE /boards/{id}
- 카드:  POST /boards/{id}/items, PATCH/DELETE /boards/{id}/items/{item_id}
추천받은 국가·기업을 보드에 담아 상태(후보/검토중/선정/제외)·메모로 정리한다. 본인 것만.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.review import ReviewBoard, ReviewItem
from app.models.user import User
from app.schemas.review import (
    BoardCreate, BoardDetailOut, BoardOut, BoardUpdate,
    ItemCreate, ItemOut, ItemUpdate,
)

router = APIRouter(prefix="/boards", tags=["workspace"])


def _own_board(db: Session, board_id: int, user: User) -> ReviewBoard:
    board = db.get(ReviewBoard, board_id)
    if board is None or board.user_id != user.user_id:
        raise HTTPException(status_code=404, detail="board not found")
    return board


# ── 보드 ──
@router.post("", response_model=BoardOut, status_code=201)
def create_board(payload: BoardCreate, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """검토 보드를 생성한다."""
    board = ReviewBoard(**payload.model_dump(exclude_none=True),
                        user_id=current_user.user_id,
                        created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db.add(board)
    db.commit()
    db.refresh(board)
    return board


@router.get("", response_model=list[BoardOut])
def list_boards(db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """내 검토 보드 목록(최신순)."""
    stmt = (select(ReviewBoard).where(ReviewBoard.user_id == current_user.user_id)
            .order_by(ReviewBoard.board_id.desc()))
    return db.execute(stmt).scalars().all()


@router.get("/{board_id}", response_model=BoardDetailOut)
def get_board(board_id: int, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    """보드 1건 + 카드 목록."""
    board = _own_board(db, board_id, current_user)
    items = db.execute(
        select(ReviewItem).where(ReviewItem.board_id == board_id)
        .order_by(ReviewItem.position, ReviewItem.item_id)
    ).scalars().all()
    return BoardDetailOut(**BoardOut.model_validate(board).model_dump(),
                          items=[ItemOut.model_validate(i) for i in items])


@router.patch("/{board_id}", response_model=BoardOut)
def update_board(board_id: int, payload: BoardUpdate, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """보드 제목·설명 수정."""
    board = _own_board(db, board_id, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(board, field, value)
    board.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(board)
    return board


@router.delete("/{board_id}", status_code=204)
def delete_board(board_id: int, db: Session = Depends(get_db),
                 current_user: User = Depends(get_current_user)):
    """보드 삭제(카드는 CASCADE로 함께 삭제)."""
    board = _own_board(db, board_id, current_user)
    db.delete(board)
    db.commit()
    return None


# ── 카드 ──
@router.post("/{board_id}/items", response_model=ItemOut, status_code=201)
def add_item(board_id: int, payload: ItemCreate, db: Session = Depends(get_db),
             current_user: User = Depends(get_current_user)):
    """보드에 카드(국가·기업·메모)를 추가한다."""
    _own_board(db, board_id, current_user)
    item = ReviewItem(board_id=board_id, **payload.model_dump(exclude_none=True),
                      created_at=datetime.utcnow(), updated_at=datetime.utcnow())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.patch("/{board_id}/items/{item_id}", response_model=ItemOut)
def update_item(board_id: int, item_id: int, payload: ItemUpdate,
                db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """카드 메모·상태(칸반 이동)·순서 수정."""
    _own_board(db, board_id, current_user)
    item = db.get(ReviewItem, item_id)
    if item is None or item.board_id != board_id:
        raise HTTPException(status_code=404, detail="item not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    item.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{board_id}/items/{item_id}", status_code=204)
def delete_item(board_id: int, item_id: int, db: Session = Depends(get_db),
                current_user: User = Depends(get_current_user)):
    """카드 삭제."""
    _own_board(db, board_id, current_user)
    item = db.get(ReviewItem, item_id)
    if item is None or item.board_id != board_id:
        raise HTTPException(status_code=404, detail="item not found")
    db.delete(item)
    db.commit()
    return None
