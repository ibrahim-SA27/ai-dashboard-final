from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from app.models.user import UserRole


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255, example="Jane Operator")
    email: EmailStr = Field(..., example="operator@plant.industrial.com")
    password: str = Field(..., min_length=6, max_length=128, example="SecureP@ssw0rd123")
    role: Optional[UserRole] = Field(default=UserRole.USER, example=UserRole.USER)


class UserLogin(BaseModel):
    email: EmailStr = Field(..., example="operator@plant.industrial.com")
    password: str = Field(..., min_length=1, example="SecureP@ssw0rd123")


class ChangePassword(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6, max_length=128)


class TokenRefresh(BaseModel):
    refresh_token: str


class UserProfile(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    role: UserRole
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfile
