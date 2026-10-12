import os

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from sentence_transformers import SentenceTransformer

from embedding_service.app import MODEL_NAME

RISK_PATTERNS = [
    ("The supplier's liability shall be unlimited and shall include all direct, indirect, incidental, and consequential losses.", "Unlimited Liability", 5),
    ("Neither party's liability is capped, regardless of the amount of damages or the cause of the claim.", "Unlimited Liability", 5),
    ("The customer is responsible for every loss arising from the services, including losses caused by the supplier.", "Unlimited Liability", 5),
    ("The supplier may recover consequential damages and lost profits without any monetary limit.", "Unlimited Liability", 4),
    ("No limitation of liability applies to any claim under this agreement.", "Unlimited Liability", 5),
    ("The supplier may terminate this agreement at any time, for any reason, without notice.", "Unilateral Termination", 5),
    ("The customer may not terminate the agreement, while the supplier may end it at its sole discretion.", "Unilateral Termination", 5),
    ("The provider may suspend or end the services immediately without giving the customer an opportunity to cure a breach.", "Unilateral Termination", 4),
    ("The supplier may cancel the contract without cause, but all customer fees already paid are non-refundable.", "Unilateral Termination", 4),
    ("Only the supplier may terminate this agreement, including when the customer has fully performed its obligations.", "Unilateral Termination", 5),
    ("The customer shall indemnify, defend, and hold harmless the supplier from every claim, whether caused by the supplier or not.", "One-Sided Indemnity", 5),
    ("The customer must reimburse the supplier for all losses and legal expenses arising from the supplier's own acts or omissions.", "One-Sided Indemnity", 5),
    ("The customer assumes sole responsibility for third-party claims connected with the services, without a fault limitation.", "One-Sided Indemnity", 4),
    ("The customer shall protect the supplier against any claim related to the agreement, including claims caused by supplier negligence.", "One-Sided Indemnity", 5),
    ("The customer will pay all defense costs incurred by the supplier upon demand, regardless of the claim's outcome.", "One-Sided Indemnity", 4),
    ("This agreement automatically renews for successive three-year terms unless the customer gives notice at least 180 days before expiry.", "Auto-Renewal Trap", 4),
    ("The contract renews automatically for another year, and cancellation is permitted only during a narrow notice window specified by the supplier.", "Auto-Renewal Trap", 4),
    ("If the customer does not provide written cancellation well in advance, the subscription renews and all fees remain due.", "Auto-Renewal Trap", 3),
    ("The supplier may change the renewal term or price before renewal, and continued use constitutes acceptance.", "Auto-Renewal Trap", 4),
    ("Failure to send a cancellation notice by certified mail at least six months before the renewal date extends the agreement automatically.", "Auto-Renewal Trap", 4),
    ("The customer shall pay all amounts requested by the supplier within a reasonable period after receiving an invoice.", "Vague Payment Terms", 3),
    ("Additional charges may be imposed from time to time at rates determined by the supplier.", "Vague Payment Terms", 4),
    ("The supplier may adjust its fees whenever it considers an adjustment appropriate, without advance notice.", "Vague Payment Terms", 4),
    ("Any disputed amount must still be paid immediately, and the supplier alone decides whether a dispute is valid.", "Vague Payment Terms", 4),
    ("Late payment charges will apply at a rate selected by the supplier and may be compounded periodically.", "Vague Payment Terms", 3),
]


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise SystemExit("Set DATABASE_URL to the PostgreSQL connection string before seeding.")

    model = SentenceTransformer(MODEL_NAME)
    texts = [pattern[0] for pattern in RISK_PATTERNS]
    embeddings = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)

    with psycopg.connect(database_url) as connection:
        register_vector(connection)
        with connection.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO risk_library
                    (clause_pattern_text, risk_category, severity_weight, embedding)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (clause_pattern_text) DO UPDATE SET
                    risk_category = EXCLUDED.risk_category,
                    severity_weight = EXCLUDED.severity_weight,
                    embedding = EXCLUDED.embedding
                """,
                [
                    (text, category, severity, Vector(embedding.tolist()))
                    for (text, category, severity), embedding in zip(RISK_PATTERNS, embeddings, strict=True)
                ],
            )
    print(f"Seeded {len(RISK_PATTERNS)} illustrative risk patterns using {MODEL_NAME}.")


if __name__ == "__main__":
    main()
