"""
Full database seeder — populates all tables with realistic demo data.
Run: docker compose exec api python -m app.scripts.seed_all
"""
import asyncio
import uuid
from datetime import date, datetime, time, timedelta, UTC

from sqlalchemy import select
from app.database import AsyncSessionLocal, Base, engine
from app.models.user import User, UserRole
from app.models.attendance import Session, AttendanceRecord
from app.models.inventory import Equipment, EquipmentCategory, EquipmentCondition
from app.models.facility import Facility, FacilitySchedule, FacilityStatus, FacilityCondition
from app.models.eligibility import AthleteEligibility, EligibilityStatus, EligibilityReasonType
from app.models.incident import Incident, IncidentCategory, IncidentSeverity, IncidentStatus
from app.models.sanction import Sanction, ViolationType, SanctionSeverity, SanctionStatus
from app.models.announcement import Announcement
from app.core.security import hash_password
from app.models import *  # noqa: F401, F403 — import all models so metadata is populated

PASSWORD = "Demo@1234"
NOW = datetime.now(UTC)
TODAY = date.today()


async def seed():
    # Ensure all tables exist before seeding
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        print("🌱 Starting full database seed...\n")

        # ─── USERS ───────────────────────────────────────────────────────
        print("👤 Seeding users...")
        users_data = [
            {"email": "admin@osca.edu.ph", "first_name": "OSCA", "last_name": "Admin", "role": UserRole.ADMIN, "sport_or_art": "All"},
            {"email": "director@osca.edu.ph", "first_name": "Maria", "last_name": "Santos", "role": UserRole.DIRECTOR, "sport_or_art": "All"},
            {"email": "coach@osca.edu.ph", "first_name": "Juan", "last_name": "Dela Cruz", "role": UserRole.COACH, "sport_or_art": "Basketball", "assigned_sport": "Basketball"},
            {"email": "coach2@osca.edu.ph", "first_name": "Pedro", "last_name": "Reyes", "role": UserRole.COACH, "sport_or_art": "Volleyball", "assigned_sport": "Volleyball"},
            {"email": "pe@osca.edu.ph", "first_name": "Ana", "last_name": "Garcia", "role": UserRole.PE_INSTRUCTOR, "sport_or_art": "General PE"},
            {"email": "staff@osca.edu.ph", "first_name": "Luis", "last_name": "Ramos", "role": UserRole.STAFF, "sport_or_art": "All"},
            {"email": "student@osca.edu.ph", "first_name": "Carlos", "last_name": "Rivera", "role": UserRole.STUDENT, "sport_or_art": "Basketball", "student_id": "2024-0001", "course": "BSIT", "year_level": "3rd Year"},
            {"email": "student2@osca.edu.ph", "first_name": "Angela", "last_name": "Cruz", "role": UserRole.STUDENT, "sport_or_art": "Volleyball", "student_id": "2024-0002", "course": "BSBA", "year_level": "2nd Year"},
            {"email": "student3@osca.edu.ph", "first_name": "Mark", "last_name": "Lopez", "role": UserRole.STUDENT, "sport_or_art": "Basketball", "student_id": "2024-0003", "course": "BSCS", "year_level": "4th Year"},
            {"email": "student4@osca.edu.ph", "first_name": "Jessica", "last_name": "Torres", "role": UserRole.STUDENT, "sport_or_art": "Dance", "student_id": "2024-0004", "course": "AB Comm", "year_level": "1st Year"},
            {"email": "student5@osca.edu.ph", "first_name": "David", "last_name": "Mendoza", "role": UserRole.STUDENT, "sport_or_art": "Basketball", "student_id": "2024-0005", "course": "BSIT", "year_level": "2nd Year"},
            {"email": "student6@osca.edu.ph", "first_name": "Sofia", "last_name": "Villanueva", "role": UserRole.STUDENT, "sport_or_art": "Volleyball", "student_id": "2024-0006", "course": "BSN", "year_level": "3rd Year"},
        ]

        user_map: dict[str, User] = {}
        for u in users_data:
            result = await db.execute(select(User).where(User.email == u["email"]))
            existing = result.scalar_one_or_none()
            if existing:
                user_map[u["email"]] = existing
                continue
            user = User(
                email=u["email"], hashed_password=hash_password(PASSWORD),
                first_name=u["first_name"], last_name=u["last_name"],
                role=u["role"], sport_or_art=u.get("sport_or_art"),
                assigned_sport=u.get("assigned_sport"), student_id=u.get("student_id"),
                course=u.get("course"), year_level=u.get("year_level"),
                is_active=True, biometric_consent=True,
            )
            db.add(user)
            user_map[u["email"]] = user
        await db.flush()
        print(f"   ✓ {len(users_data)} users ready")

        # ─── FACILITIES ──────────────────────────────────────────────────
        print("🏟️  Seeding facilities...")
        facilities_data = [
            {"name": "Covered Court", "description": "Multi-purpose covered court for basketball and volleyball games.", "location": "Covered Court", "capacity": 500, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
            {"name": "Upper Gym", "description": "Upper floor gymnasium for indoor sports and training.", "location": "Upper Gym", "capacity": 200, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
            {"name": "Band Room", "description": "Music room used for band practice and rehearsals.", "location": "Band Room", "capacity": 60, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
            {"name": "CAU Studio", "description": "Studio space for creative and performing arts activities.", "location": "CAU Studio", "capacity": 80, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
            {"name": "Open Ground", "description": "Open field for outdoor sports, drills, and school events.", "location": "Open Ground", "capacity": 300, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
            {"name": "Weights Room", "description": "Fitness room equipped with weights and exercise machines.", "location": "Weights Room", "capacity": 30, "status": FacilityStatus.AVAILABLE, "condition": FacilityCondition.GOOD},
        ]
        facility_map: dict[str, Facility] = {}
        for f in facilities_data:
            result = await db.execute(select(Facility).where(Facility.name == f["name"]))
            existing = result.scalar_one_or_none()
            if existing:
                facility_map[f["name"]] = existing
                continue
            fac = Facility(**f)
            db.add(fac)
            facility_map[f["name"]] = fac
        await db.flush()
        print(f"   ✓ {len(facilities_data)} facilities ready")

        # ─── FACILITY SCHEDULES ──────────────────────────────────────────
        print("📅 Seeding facility schedules...")
        schedules_data = [
            {"facility": "Covered Court", "title": "Basketball Practice - Varsity", "date": TODAY, "start": time(6, 0), "end": time(8, 0), "sport": "Basketball"},
            {"facility": "Covered Court", "title": "Volleyball Training", "date": TODAY, "start": time(14, 0), "end": time(16, 0), "sport": "Volleyball"},
            {"facility": "Upper Gym", "title": "Dance Rehearsal", "date": TODAY, "start": time(9, 0), "end": time(11, 0), "sport": "Dance"},
            {"facility": "Gym", "title": "Weight Training - Athletes", "date": TODAY + timedelta(days=1), "start": time(7, 0), "end": time(9, 0), "sport": "General"},
            {"facility": "Track & Field", "title": "Morning Run", "date": TODAY + timedelta(days=1), "start": time(5, 30), "end": time(7, 0), "sport": "Athletics"},
        ]
        for s in schedules_data:
            fac = facility_map.get(s["facility"])
            if not fac: continue
            sched = FacilitySchedule(facility_id=fac.id, title=s["title"], scheduled_date=s["date"], start_time=s["start"], end_time=s["end"], sport_or_activity=s["sport"], booked_by_id=user_map["coach@osca.edu.ph"].id)
            db.add(sched)
        await db.flush()
        print(f"   ✓ {len(schedules_data)} schedules ready")

        # ─── EQUIPMENT ───────────────────────────────────────────────────
        print("📦 Seeding equipment...")
        equipment_data = [
            {"name": "Basketball - Molten", "category": EquipmentCategory.BALLS, "condition": EquipmentCondition.GOOD, "total_quantity": 20, "available_quantity": 15, "sport_or_art": "Basketball", "storage_location": "Storage Room A"},
            {"name": "Volleyball - Mikasa", "category": EquipmentCategory.BALLS, "condition": EquipmentCondition.GOOD, "total_quantity": 15, "available_quantity": 12, "sport_or_art": "Volleyball", "storage_location": "Storage Room A"},
            {"name": "Badminton Racket", "category": EquipmentCategory.RACKETS, "condition": EquipmentCondition.FAIR, "total_quantity": 30, "available_quantity": 25, "sport_or_art": "Badminton", "storage_location": "Storage Room B"},
            {"name": "Volleyball Net", "category": EquipmentCategory.NETS, "condition": EquipmentCondition.GOOD, "total_quantity": 5, "available_quantity": 4, "sport_or_art": "Volleyball", "storage_location": "Gym Storage"},
            {"name": "Basketball Jersey Set", "category": EquipmentCategory.UNIFORMS, "condition": EquipmentCondition.NEW, "total_quantity": 30, "available_quantity": 30, "sport_or_art": "Basketball", "storage_location": "Uniform Room"},
            {"name": "Agility Ladder", "category": EquipmentCategory.TRAINING_AIDS, "condition": EquipmentCondition.GOOD, "total_quantity": 10, "available_quantity": 8, "sport_or_art": "General", "storage_location": "Storage Room B"},
            {"name": "Cones (Set of 20)", "category": EquipmentCategory.TRAINING_AIDS, "condition": EquipmentCondition.GOOD, "total_quantity": 5, "available_quantity": 5, "sport_or_art": "General", "storage_location": "Storage Room B"},
            {"name": "Stopwatch Digital", "category": EquipmentCategory.ELECTRONIC, "condition": EquipmentCondition.GOOD, "total_quantity": 10, "available_quantity": 9, "sport_or_art": "General", "storage_location": "Office"},
            {"name": "First Aid Kit", "category": EquipmentCategory.OTHER, "condition": EquipmentCondition.GOOD, "total_quantity": 5, "available_quantity": 5, "sport_or_art": "General", "storage_location": "Medical Room"},
            {"name": "Yoga Mat", "category": EquipmentCategory.TRAINING_AIDS, "condition": EquipmentCondition.NEW, "total_quantity": 25, "available_quantity": 20, "sport_or_art": "Dance", "storage_location": "Dance Studio"},
        ]
        for e in equipment_data:
            result = await db.execute(select(Equipment).where(Equipment.name == e["name"]))
            if result.scalar_one_or_none(): continue
            equip = Equipment(**e, qr_code=f"OSCA-EQ-{uuid.uuid4().hex[:8].upper()}", created_by_id=user_map["admin@osca.edu.ph"].id)
            db.add(equip)
        await db.flush()
        print(f"   ✓ {len(equipment_data)} equipment items ready")

        # ─── SESSIONS ────────────────────────────────────────────────────
        print("📋 Seeding attendance sessions...")
        sessions_data = [
            {"name": "Morning Practice - Basketball", "activity_type": "practice", "sport_or_art": "Basketball", "venue": "Covered Court", "start": NOW - timedelta(hours=3), "end": NOW - timedelta(hours=1)},
            {"name": "Afternoon Training - Volleyball", "activity_type": "training", "sport_or_art": "Volleyball", "venue": "Covered Court", "start": NOW - timedelta(days=1, hours=5), "end": NOW - timedelta(days=1, hours=3)},
            {"name": "Dance Rehearsal", "activity_type": "practice", "sport_or_art": "Dance", "venue": "Upper Gym", "start": NOW - timedelta(days=2, hours=4), "end": NOW - timedelta(days=2, hours=2)},
            {"name": "Inter-School Basketball", "activity_type": "competition", "sport_or_art": "Basketball", "venue": "Covered Court", "start": NOW + timedelta(days=3), "end": NOW + timedelta(days=3, hours=3)},
            {"name": "Weekly Fitness Test", "activity_type": "event", "sport_or_art": "General", "venue": "Gym", "start": NOW + timedelta(days=1), "end": NOW + timedelta(days=1, hours=2)},
        ]
        session_objs = []
        for s in sessions_data:
            result = await db.execute(select(Session).where(Session.name == s["name"]))
            if result.scalar_one_or_none(): continue
            sess = Session(name=s["name"], activity_type=s["activity_type"], sport_or_art=s["sport_or_art"], venue=s["venue"], scheduled_start=s["start"], scheduled_end=s["end"], is_active=True, created_by_id=user_map["coach@osca.edu.ph"].id)
            db.add(sess)
            session_objs.append(sess)
        await db.flush()
        print(f"   ✓ {len(sessions_data)} sessions ready")

        # ─── ATTENDANCE RECORDS ──────────────────────────────────────────
        print("✅ Seeding attendance records...")
        students = [user_map[e] for e in ["student@osca.edu.ph", "student2@osca.edu.ph", "student3@osca.edu.ph", "student4@osca.edu.ph", "student5@osca.edu.ph", "student6@osca.edu.ph"]]
        if session_objs:
            for sess in session_objs[:3]:
                for i, stu in enumerate(students[:4]):
                    ar = AttendanceRecord(student_id=stu.id, session_id=sess.id, time_in=sess.scheduled_start + timedelta(minutes=i * 2), time_out=sess.scheduled_start + timedelta(hours=1, minutes=30 + i * 5), duration_minutes=90 + i * 5, is_complete=True)
                    db.add(ar)
        await db.flush()
        print("   ✓ Attendance records seeded")

        # ─── ELIGIBILITY ─────────────────────────────────────────────────
        print("🛡️  Seeding eligibility records...")
        elig_data = [
            {"student": "student3@osca.edu.ph", "status": EligibilityStatus.RESTRICTED, "reason_type": EligibilityReasonType.INJURY, "reason_detail": "Sprained ankle during practice", "start_date": TODAY - timedelta(days=5)},
            {"student": "student4@osca.edu.ph", "status": EligibilityStatus.PENDING_CLEARANCE, "reason_type": EligibilityReasonType.MEDICAL, "reason_detail": "Pending medical certificate", "start_date": TODAY - timedelta(days=3)},
            {"student": "student5@osca.edu.ph", "status": EligibilityStatus.INELIGIBLE, "reason_type": EligibilityReasonType.ACADEMIC, "reason_detail": "Below required GPA", "start_date": TODAY - timedelta(days=10)},
            {"student": "student6@osca.edu.ph", "status": EligibilityStatus.ELIGIBLE, "reason_type": EligibilityReasonType.INJURY, "reason_detail": "Recovered from knee injury", "start_date": TODAY - timedelta(days=30), "end_date": TODAY - timedelta(days=5), "medical_clearance": True},
        ]
        for e in elig_data:
            stu = user_map[e["student"]]
            rec = AthleteEligibility(student_id=stu.id, status=e["status"], reason_type=e["reason_type"], reason_detail=e["reason_detail"], start_date=e["start_date"], end_date=e.get("end_date"), medical_clearance=e.get("medical_clearance", False), is_current=True, created_by_id=user_map["coach@osca.edu.ph"].id)
            db.add(rec)
        await db.flush()
        print(f"   ✓ {len(elig_data)} eligibility records ready")

        # ─── INCIDENTS ───────────────────────────────────────────────────
        print("⚠️  Seeding incidents...")
        incidents_data = [
            {"title": "Student injured during practice", "description": "Mark Lopez twisted his ankle during basketball drills", "category": IncidentCategory.INJURY, "severity": IncidentSeverity.MEDIUM, "student": "student3@osca.edu.ph", "location": "Covered Court"},
            {"title": "Broken basketball hoop", "description": "The left side basketball hoop rim detached during a dunk attempt", "category": IncidentCategory.FACILITY_DAMAGE, "severity": IncidentSeverity.HIGH, "location": "Covered Court"},
            {"title": "Missing volleyball equipment", "description": "3 Mikasa volleyballs unaccounted for after training", "category": IncidentCategory.EQUIPMENT_DAMAGE, "severity": IncidentSeverity.LOW, "location": "Storage Room A"},
            {"title": "Altercation between players", "description": "Two players had a verbal altercation during scrimmage", "category": IncidentCategory.BEHAVIORAL, "severity": IncidentSeverity.MEDIUM, "student": "student5@osca.edu.ph", "location": "Covered Court"},
            {"title": "Wet floor slip hazard", "description": "Water leak near gym entrance causing slippery floor", "category": IncidentCategory.SAFETY, "severity": IncidentSeverity.HIGH, "location": "Gym entrance"},
        ]
        for inc in incidents_data:
            stu_id = user_map[inc["student"]].id if inc.get("student") else None
            record = Incident(title=inc["title"], description=inc["description"], category=inc["category"], severity=inc["severity"], status=IncidentStatus.OPEN, incident_date=NOW - timedelta(days=2), location=inc.get("location"), reported_by_id=user_map["coach@osca.edu.ph"].id, involved_student_id=stu_id)
            db.add(record)
        await db.flush()
        print(f"   ✓ {len(incidents_data)} incidents ready")

        # ─── SANCTIONS ───────────────────────────────────────────────────
        print("⚖️  Seeding sanctions...")
        sanctions_data = [
            {"student": "student3@osca.edu.ph", "violation_type": ViolationType.TARDINESS, "severity": SanctionSeverity.WARNING, "description": "Late to practice 3 consecutive times", "violation_date": TODAY - timedelta(days=7), "start_date": TODAY - timedelta(days=7)},
            {"student": "student5@osca.edu.ph", "violation_type": ViolationType.MISCONDUCT, "severity": SanctionSeverity.MINOR, "description": "Disrespectful behavior towards teammate during game", "violation_date": TODAY - timedelta(days=4), "start_date": TODAY - timedelta(days=4), "end_date": TODAY + timedelta(days=10), "penalty": "1 week suspension from practice"},
            {"student": "student5@osca.edu.ph", "violation_type": ViolationType.ABSENCE, "severity": SanctionSeverity.WARNING, "description": "Unexcused absence from mandatory team meeting", "violation_date": TODAY - timedelta(days=14), "start_date": TODAY - timedelta(days=14)},
            {"student": "student@osca.edu.ph", "violation_type": ViolationType.DRESS_CODE, "severity": SanctionSeverity.WARNING, "description": "Did not wear proper practice uniform", "violation_date": TODAY - timedelta(days=2), "start_date": TODAY - timedelta(days=2)},
            {"student": "student2@osca.edu.ph", "violation_type": ViolationType.EQUIPMENT_MISUSE, "severity": SanctionSeverity.MINOR, "description": "Used equipment without proper sign-out", "violation_date": TODAY - timedelta(days=1), "start_date": TODAY - timedelta(days=1), "penalty": "Written warning filed"},
            {"student": "student4@osca.edu.ph", "violation_type": ViolationType.TARDINESS, "severity": SanctionSeverity.WARNING, "description": "Arrived 30 minutes late to competition warm-up", "violation_date": TODAY - timedelta(days=3), "start_date": TODAY - timedelta(days=3)},
        ]
        for s in sanctions_data:
            stu = user_map[s["student"]]
            sanc = Sanction(student_id=stu.id, issued_by_id=user_map["coach@osca.edu.ph"].id, violation_type=s["violation_type"], severity=s["severity"], status=SanctionStatus.ACTIVE, description=s["description"], violation_date=s["violation_date"], start_date=s["start_date"], end_date=s.get("end_date"), penalty=s.get("penalty"))
            db.add(sanc)
        await db.flush()
        print(f"   ✓ {len(sanctions_data)} sanctions ready")

        # ─── ANNOUNCEMENTS ───────────────────────────────────────────────
        print("📢 Seeding announcements...")
        announcements_data = [
            {"title": "Inter-School Basketball Tournament", "content": "OSCA will be hosting the annual inter-school basketball tournament. All varsity players must attend the orientation meeting.", "event_date": NOW + timedelta(days=14)},
            {"title": "Equipment Return Reminder", "content": "All borrowed equipment must be returned by end of week. Failure to return will result in borrowing privileges suspension.", "event_date": None},
            {"title": "New Gym Schedule", "content": "Starting next week, the gym will open at 5:30 AM for morning training. Please adjust your schedules accordingly.", "event_date": NOW + timedelta(days=7)},
            {"title": "Sports Day 2024", "content": "Annual Sports Day is coming! Sign up for events through your team coaches. Deadline: Friday.", "event_date": NOW + timedelta(days=21)},
        ]
        for a in announcements_data:
            ann = Announcement(title=a["title"], content=a["content"], event_date=a["event_date"], is_active=True, created_by_id=user_map["admin@osca.edu.ph"].id)
            db.add(ann)
        await db.flush()
        print(f"   ✓ {len(announcements_data)} announcements ready")

        # ─── COMMIT ──────────────────────────────────────────────────────
        await db.commit()
        print("\n🎉 Database seeding complete! All tables populated.")
        print(f"   Password for all accounts: {PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
