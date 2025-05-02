"""
Backup service for business logic related to backups.
"""

from typing import List, Optional, Dict, Any
from uuid import UUID
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from ..repository import BackupRepository, PadRepository, UserRepository

class BackupService:
    """Service for backup-related business logic"""
    
    def __init__(self, session: AsyncSession):
        """Initialize the service with a database session"""
        self.session = session
        self.repository = BackupRepository(session)
        self.pad_repository = PadRepository(session)
    
    async def create_backup(self, source_id: UUID, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new backup"""
        # Validate input
        if not data:
            raise ValueError("Backup data is required")
        
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Create backup
        backup = await self.repository.create(source_id, data)
        return backup.to_dict()
    
    async def get_backup(self, backup_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a backup by ID"""
        backup = await self.repository.get_by_id(backup_id)
        return backup.to_dict() if backup else None
    
    async def get_backups_by_source(self, source_id: UUID) -> List[Dict[str, Any]]:
        """Get all backups for a specific source pad"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        backups = await self.repository.get_by_source(source_id)
        return [backup.to_dict() for backup in backups]
    
    async def get_latest_backup(self, source_id: UUID) -> Optional[Dict[str, Any]]:
        """Get the most recent backup for a specific source pad"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        backup = await self.repository.get_latest_by_source(source_id)
        return backup.to_dict() if backup else None
    
    async def get_backups_by_date_range(self, source_id: UUID, start_date: datetime, end_date: datetime) -> List[Dict[str, Any]]:
        """Get backups for a specific source pad within a date range"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Validate date range
        if start_date > end_date:
            raise ValueError("Start date must be before end date")
        
        backups = await self.repository.get_by_date_range(source_id, start_date, end_date)
        return [backup.to_dict() for backup in backups]
    
    async def delete_backup(self, backup_id: UUID) -> bool:
        """Delete a backup"""
        # Get the backup to check if it exists
        backup = await self.repository.get_by_id(backup_id)
        if not backup:
            raise ValueError(f"Backup with ID '{backup_id}' does not exist")
        
        return await self.repository.delete(backup_id)
    
    async def manage_backups(self, source_id: UUID, max_backups: int = 10) -> int:
        """Manage backups for a source pad, keeping only the most recent ones"""
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Validate max_backups
        if max_backups < 1:
            raise ValueError("Maximum number of backups must be at least 1")
        
        # Count current backups
        backup_count = await self.repository.count_by_source(source_id)
        
        # If we have more backups than the maximum, delete the oldest ones
        if backup_count > max_backups:
            return await self.repository.delete_older_than(source_id, max_backups)
        
        return 0  # No backups deleted
        
    async def get_backups_by_user(self, user_id: UUID, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get backups for a user's first pad directly using a join operation.
        This eliminates the N+1 query problem by fetching the pad and its backups in a single query.
        
        Args:
            user_id: The user ID to get backups for
            limit: Maximum number of backups to return
            
        Returns:
            List of backup dictionaries
        """
        # Check if user exists
        user_repository = UserRepository(self.session)
        user = await user_repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User with ID '{user_id}' does not exist")
        
        # Get backups directly with a single query
        backups = await self.repository.get_backups_by_user(user_id, limit)
        return [backup.to_dict() for backup in backups]
        
    async def create_backup_if_needed(self, source_id: UUID, data: Dict[str, Any], 
                                     min_interval_minutes: int = 5, 
                                     max_backups: int = 10) -> Optional[Dict[str, Any]]:
        """
        Create a backup only if needed:
        - If there are no existing backups
        - If the latest backup is older than the specified interval
        
        Args:
            source_id: The ID of the source pad
            data: The data to backup
            min_interval_minutes: Minimum time between backups in minutes
            max_backups: Maximum number of backups to keep
            
        Returns:
            The created backup dict if a backup was created, None otherwise
        """
        # Check if source pad exists
        source_pad = await self.pad_repository.get_by_id(source_id)
        if not source_pad:
            raise ValueError(f"Pad with ID '{source_id}' does not exist")
        
        # Get the latest backup
        latest_backup = await self.repository.get_latest_by_source(source_id)
        
        # Calculate the current time
        current_time = datetime.now()
        
        # Determine if we need to create a backup
        create_backup = False
        
        if not latest_backup:
            # No backups exist yet, so create one
            create_backup = True
        else:
            # Check if the latest backup is older than the minimum interval
            backup_age = current_time - latest_backup.created_at
            if backup_age.total_seconds() > (min_interval_minutes * 60):
                create_backup = True
        
        # Create a backup if needed
        if create_backup:
            backup = await self.repository.create(source_id, data)
            
            # Manage backups (clean up old ones)
            await self.manage_backups(source_id, max_backups)
            
            return backup.to_dict()
        
        return None
