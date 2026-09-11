from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, UserRole
from app.models.alert import AlertSetting
from app.schemas.user import (
    UserRegister,
    UserLogin,
    UserProfile,
    ChangePassword,
    TokenResponse,
    TokenRefresh,
)
from app.utils.security import hash_password, verify_password
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.dependencies import get_current_user

router = APIRouter(prefix="/api", tags=["Authentication & Profile"])


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new operator or administrator"
)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    """Registers a new user account, initializes default alert settings, and returns JWT tokens."""
    existing_user = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )

    # First user can automatically be an admin if requested, otherwise default to USER
    total_users = db.query(User).count()
    assigned_role = UserRole.ADMIN if total_users == 0 else (payload.role or UserRole.USER)

    new_user = User(
        full_name=payload.full_name.strip(),
        email=payload.email.lower().strip(),
        password_hash=hash_password(payload.password),
        role=assigned_role,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Create default alert setting for user
    default_setting = AlertSetting(
        user_id=new_user.id,
        receiver_email=new_user.email,
        enable_email_alert=True,
        critical_threshold=75.0
    )
    db.add(default_setting)
    db.commit()

    token_data = {"sub": new_user.email, "role": new_user.role.value, "user_id": new_user.id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserProfile.from_orm(new_user)
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and return JWT tokens"
)
def login_user(payload: UserLogin, db: Session = Depends(get_db)):
    """Authenticates credentials against bcrypt password hashes and returns JWT access + refresh tokens."""
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_data = {"sub": user.email, "role": user.role.value, "user_id": user.id}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user=UserProfile.from_orm(user)
    )


@router.post(
    "/logout",
    status_code=status.HTTP_200_OK,
    summary="Log out user"
)
def logout_user(current_user: User = Depends(get_current_user)):
    """Acknowledge user logout session."""
    return {"message": "Successfully logged out", "user_id": current_user.id}


@router.post(
    "/refresh",
    summary="Refresh access token using valid refresh token"
)
def refresh_token_endpoint(payload: TokenRefresh, db: Session = Depends(get_db)):
    """Generates a new access token from a valid JWT refresh token."""
    decoded = decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )

    email = decoded.get("sub")
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    token_data = {"sub": user.email, "role": user.role.value, "user_id": user.id}
    new_access_token = create_access_token(token_data)

    return {
        "access_token": new_access_token,
        "token_type": "bearer"
    }


@router.get(
    "/profile",
    response_model=UserProfile,
    summary="Get current user profile"
)
def get_profile(current_user: User = Depends(get_current_user)):
    """Retrieves authenticated user profile information."""
    return UserProfile.from_orm(current_user)


@router.post(
    "/change-password",
    status_code=status.HTTP_200_OK,
    summary="Change current user password"
)
def change_password(
    payload: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Verifies existing password and updates to a new hashed password."""
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )

    if len(payload.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 6 characters long"
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Password changed successfully"}
