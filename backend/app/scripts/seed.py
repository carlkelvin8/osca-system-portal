import asyncio

from app.core.security import hash_password
from app.database import AsyncSessionLocal, Base, engine
from app.models.user import User, UserRole
from app.models import *  # noqa: F401, F403 — import all models so metadata is populated

SEED_USERS = [
    {
        "email": "admin@osca.naap.edu.ph",
        "password": "OSCAAdmin2026!",
        "first_name": "OSCA",
        "last_name": "Administrator",
        "role": UserRole.ADMIN,
    },
    {
        "email": "coach@osca.naap.edu.ph",
        "password": "OSCACoach2026!",
        "first_name": "Demo",
        "last_name": "Coach",
        "role": UserRole.COACH,
        "assigned_sport": "Basketball",
    },
    {
        "email": "pe.instructor@osca.naap.edu.ph",
        "password": "OSCAPEInst2026!",
        "first_name": "Demo",
        "last_name": "Instructor",
        "role": UserRole.PE_INSTRUCTOR,
    },
    {
        "email": "student@osca.naap.edu.ph",
        "password": "OSCAStudent2026!",
        "first_name": "Demo",
        "last_name": "Student",
        "role": UserRole.STUDENT,
        "sport_or_art": "Basketball",
        "student_id": "2026-00001",
        "biometric_consent": True,
    },
    {
        "email": "director@osca.naap.edu.ph",
        "password": "OSCADir2026!",
        "first_name": "OSCA",
        "last_name": "Director",
        "role": UserRole.DIRECTOR,
    },
    {
        "email": "staff@osca.naap.edu.ph",
        "password": "OSCAStaff2026!",
        "first_name": "OSCA",
        "last_name": "Staff",
        "role": UserRole.STAFF,
    },
]


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        from sqlalchemy import select

        created: list[str] = []
        skipped: list[str] = []

        for data in SEED_USERS:
            email = data["email"]
            result = await db.execute(select(User).where(User.email == email))
            if result.scalar_one_or_none():
                skipped.append(email)
                continue

            user = User(
                email=email,
                hashed_password=hash_password(data["password"]),
                first_name=data["first_name"],
                last_name=data["last_name"],
                role=data["role"],
                is_active=True,
                biometric_consent=data.get("biometric_consent", False),
                assigned_sport=data.get("assigned_sport"),
                sport_or_art=data.get("sport_or_art"),
                student_id=data.get("student_id"),
            )
            db.add(user)
            created.append(f"{email} [{data['role'].value}]")

        await db.commit()

        if skipped:
            print(f"Skipped (already exist): {', '.join(skipped)}")
        if created:
            print("Seed users created:")
            for entry in created:
                print(f"  ✓ {entry}")
            print("\nIMPORTANT: Change all default passwords immediately after first login.")
        if not created and not skipped:
            print("Nothing to seed.")


if __name__ == "__main__":
    asyncio.run(seed())

