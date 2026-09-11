"""Initial schema for users, sensor_readings, alert_settings, and alert_logs

Revision ID: 001_initial_schema
Revises: 
Create Date: 2026-08-21 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. users table
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.Enum('ADMIN', 'USER', name='userrole'), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    # 2. sensor_readings table
    op.create_table(
        'sensor_readings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('ph', sa.Float(), nullable=False),
        sa.Column('tds', sa.Float(), nullable=False),
        sa.Column('turbidity', sa.Float(), nullable=False),
        sa.Column('temperature', sa.Float(), nullable=False),
        sa.Column('flow_rate', sa.Float(), nullable=False),
        sa.Column('pollution_score', sa.Float(), nullable=False),
        sa.Column('status', sa.Enum('SAFE', 'WARNING', 'CRITICAL', name='effluentstatus'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sensor_readings_id'), 'sensor_readings', ['id'], unique=False)
    op.create_index(op.f('ix_sensor_readings_status'), 'sensor_readings', ['status'], unique=False)
    op.create_index(op.f('ix_sensor_readings_timestamp'), 'sensor_readings', ['timestamp'], unique=False)

    # 3. alert_settings table
    op.create_table(
        'alert_settings',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('receiver_email', sa.String(length=255), nullable=False),
        sa.Column('enable_email_alert', sa.Boolean(), nullable=False),
        sa.Column('critical_threshold', sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alert_settings_id'), 'alert_settings', ['id'], unique=False)
    op.create_index(op.f('ix_alert_settings_user_id'), 'alert_settings', ['user_id'], unique=True)

    # 4. alert_logs table
    op.create_table(
        'alert_logs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('reading_id', sa.Integer(), nullable=True),
        sa.Column('receiver_email', sa.String(length=255), nullable=False),
        sa.Column('alert_type', sa.Enum('CRITICAL_POLLUTION', 'ABNORMAL_DISCHARGE', 'SENSOR_FAILURE', name='alerttype'), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('sent_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['reading_id'], ['sensor_readings.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_alert_logs_id'), 'alert_logs', ['id'], unique=False)
    op.create_index(op.f('ix_alert_logs_reading_id'), 'alert_logs', ['reading_id'], unique=False)
    op.create_index(op.f('ix_alert_logs_sent_at'), 'alert_logs', ['sent_at'], unique=False)


def downgrade() -> None:
    op.drop_table('alert_logs')
    op.drop_table('alert_settings')
    op.drop_table('sensor_readings')
    op.drop_table('users')
