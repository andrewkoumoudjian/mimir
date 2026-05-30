"use client";

import { useMemo } from "react";
import {
  DEMO_APPROVERS,
  DEMO_DEPARTMENTS,
  DEMO_EMPLOYEES,
  formatExpenseTypeLabel,
  formatPaymentMethodLabel,
  formatTransportTypeLabel,
} from "@/lib/pre-approval/mock-enrichment";
import type {
  ExpenseRequestInput,
  ExpenseType,
  PaymentMethod,
  TipContext,
  TransportType,
} from "@/types/pre-approval";

type ExpenseRequestFormProps = {
  value: ExpenseRequestInput;
  isSubmitting: boolean;
  onChange: (nextValue: ExpenseRequestInput) => void;
  onSubmit: () => void;
};

const expenseTypes: ExpenseType[] = [
  "meal",
  "client_entertainment",
  "taxi",
  "parking",
  "toll",
  "car_rental",
  "lodging",
  "software",
  "credit_card_fee",
  "ticket",
  "other",
];

const paymentMethods: PaymentMethod[] = ["corporate_card", "personal_card", "reimbursement"];
const transportTypes: TransportType[] = [
  "air",
  "rail",
  "car_rental",
  "personal_vehicle",
  "taxi",
  "parking",
  "other",
];
const tipContexts: TipContext[] = ["meal", "service"];

export function ExpenseRequestForm({
  value,
  isSubmitting,
  onChange,
  onSubmit,
}: ExpenseRequestFormProps) {
  const selectedEmployee = useMemo(
    () => DEMO_EMPLOYEES.find((employee) => employee.id === value.employeeId) ?? DEMO_EMPLOYEES[0],
    [value.employeeId],
  );
  const showTransportFields =
    value.travelRelated ||
    value.expenseType === "taxi" ||
    value.expenseType === "parking" ||
    value.expenseType === "toll" ||
    value.expenseType === "car_rental";
  const showTipFields =
    value.expenseType === "meal" ||
    value.expenseType === "client_entertainment" ||
    value.expenseType === "taxi";

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="section-kicker">Pre-Approval</p>
          <h2>New expense request</h2>
        </div>
        <span className="muted-line">Deterministic review only</span>
      </div>

      <div className="pre-approval-form-grid">
        <label className="pre-approval-field">
          <span>Employee</span>
          <select
            value={value.employeeId}
            onChange={(event) => {
              const employee = DEMO_EMPLOYEES.find((item) => item.id === event.target.value) ?? DEMO_EMPLOYEES[0];
              onChange({
                ...value,
                employeeId: employee.id,
                departmentId: employee.departmentId,
                approverId: employee.defaultApproverId,
              });
            }}
          >
            {DEMO_EMPLOYEES.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </label>

        <label className="pre-approval-field">
          <span>Department</span>
          <select
            value={value.departmentId}
            onChange={(event) => onChange({ ...value, departmentId: event.target.value })}
          >
            {DEMO_DEPARTMENTS.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>

        <label className="pre-approval-field">
          <span>Approver</span>
          <select
            value={value.approverId}
            onChange={(event) => onChange({ ...value, approverId: event.target.value })}
          >
            {DEMO_APPROVERS.map((approver) => (
              <option key={approver.id} value={approver.id}>
                {approver.name}
              </option>
            ))}
          </select>
        </label>

        <label className="pre-approval-field">
          <span>Expense type</span>
          <select
            value={value.expenseType}
            onChange={(event) => {
              const nextExpenseType = event.target.value as ExpenseType;
              const nextTransportType =
                nextExpenseType === "car_rental"
                  ? "car_rental"
                  : nextExpenseType === "taxi"
                    ? "taxi"
                    : nextExpenseType === "parking"
                      ? "parking"
                      : nextExpenseType === "toll"
                        ? "other"
                        : undefined;
              const keepsTipFields =
                nextExpenseType === "meal" ||
                nextExpenseType === "client_entertainment" ||
                nextExpenseType === "taxi";

              onChange({
                ...value,
                expenseType: nextExpenseType,
                transportType: value.travelRelated ? value.transportType : nextTransportType,
                tipAmount: keepsTipFields ? value.tipAmount : undefined,
                tipContext: keepsTipFields ? value.tipContext : undefined,
              });
            }}
          >
            {expenseTypes.map((expenseType) => (
              <option key={expenseType} value={expenseType}>
                {formatExpenseTypeLabel(expenseType)}
              </option>
            ))}
          </select>
        </label>

        <label className="pre-approval-field">
          <span>Amount</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={value.amount}
            onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })}
          />
        </label>

        <label className="pre-approval-field">
          <span>Currency</span>
          <select
            value={value.currency}
            onChange={(event) => onChange({ ...value, currency: event.target.value })}
          >
            <option value="CAD">CAD</option>
            <option value="USD">USD</option>
          </select>
        </label>

        <label className="pre-approval-field pre-approval-field-wide">
          <span>Business purpose</span>
          <textarea
            rows={3}
            value={value.businessPurpose}
            onChange={(event) => onChange({ ...value, businessPurpose: event.target.value })}
          />
        </label>

        <label className="pre-approval-field">
          <span>Request date</span>
          <input
            type="date"
            value={value.requestDate}
            onChange={(event) => onChange({ ...value, requestDate: event.target.value })}
          />
        </label>

        <label className="pre-approval-field">
          <span>Event date</span>
          <input
            type="date"
            value={value.eventDate ?? ""}
            onChange={(event) => onChange({ ...value, eventDate: event.target.value })}
          />
        </label>

        <label className="pre-approval-field">
          <span>Payment method</span>
          <select
            value={value.paymentMethod}
            onChange={(event) =>
              onChange({ ...value, paymentMethod: event.target.value as PaymentMethod })
            }
          >
            {paymentMethods.map((paymentMethod) => (
              <option key={paymentMethod} value={paymentMethod}>
                {formatPaymentMethodLabel(paymentMethod)}
              </option>
            ))}
          </select>
        </label>

        <label className="pre-approval-field">
          <span>Merchant name</span>
          <input
            type="text"
            value={value.merchantName ?? ""}
            onChange={(event) => onChange({ ...value, merchantName: event.target.value })}
          />
        </label>

        <label className="pre-approval-toggle">
          <input
            type="checkbox"
            checked={value.travelRelated}
            onChange={(event) => onChange({ ...value, travelRelated: event.target.checked })}
          />
          <span>Travel-related request</span>
        </label>

        <label className="pre-approval-toggle">
          <input
            type="checkbox"
            checked={value.customerEntertainment}
            onChange={(event) => onChange({ ...value, customerEntertainment: event.target.checked })}
          />
          <span>Customer entertainment</span>
        </label>

        <label className="pre-approval-toggle">
          <input
            type="checkbox"
            checked={value.alcoholIncluded}
            onChange={(event) => onChange({ ...value, alcoholIncluded: event.target.checked })}
          />
          <span>Alcohol included</span>
        </label>

        {value.customerEntertainment ? (
          <label className="pre-approval-field pre-approval-field-wide">
            <span>Guest names</span>
            <input
              type="text"
              value={value.guestNames ?? ""}
              onChange={(event) => onChange({ ...value, guestNames: event.target.value })}
            />
          </label>
        ) : null}

        {value.alcoholIncluded ? (
          <label className="pre-approval-field pre-approval-field-wide">
            <span>Alcohol context</span>
            <textarea
              rows={2}
              value={value.alcoholContext ?? ""}
              onChange={(event) => onChange({ ...value, alcoholContext: event.target.value })}
              placeholder="Explain the customer dining context if alcohol is included."
            />
          </label>
        ) : null}

        {showTransportFields ? (
          <>
            <label className="pre-approval-field">
              <span>Transport type</span>
              <select
                value={value.transportType ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    transportType: (event.target.value || undefined) as TransportType | undefined,
                  })
                }
              >
                <option value="">Select transport type</option>
                {transportTypes.map((transportType) => (
                  <option key={transportType} value={transportType}>
                    {formatTransportTypeLabel(transportType)}
                  </option>
                ))}
              </select>
            </label>

            <label className="pre-approval-field">
              <span>Traveler count</span>
              <input
                type="number"
                min="1"
                step="1"
                value={value.travelerCount ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    travelerCount: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </label>

            <label className="pre-approval-field">
              <span>City</span>
              <input
                type="text"
                value={value.locationCity ?? ""}
                onChange={(event) => onChange({ ...value, locationCity: event.target.value })}
              />
            </label>

            <label className="pre-approval-field">
              <span>Country</span>
              <input
                type="text"
                value={value.locationCountry ?? ""}
                onChange={(event) => onChange({ ...value, locationCountry: event.target.value })}
              />
            </label>
          </>
        ) : null}

        {showTipFields ? (
          <>
            <label className="pre-approval-field">
              <span>Tip amount</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={value.tipAmount ?? ""}
                onChange={(event) =>
                  onChange({
                    ...value,
                    tipAmount: event.target.value ? Number(event.target.value) : undefined,
                  })
                }
              />
            </label>

            <label className="pre-approval-field">
              <span>Tip context</span>
              <select
                value={value.tipContext ?? "meal"}
                onChange={(event) =>
                  onChange({ ...value, tipContext: event.target.value as TipContext })
                }
              >
                {tipContexts.map((tipContext) => (
                  <option key={tipContext} value={tipContext}>
                    {tipContext === "meal" ? "Meal tip" : "Service / porterage"}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}

        <label className="pre-approval-field pre-approval-field-wide">
          <span>Notes</span>
          <textarea
            rows={3}
            value={value.notes ?? ""}
            onChange={(event) => onChange({ ...value, notes: event.target.value })}
            placeholder={`Optional reviewer note for ${selectedEmployee.name}'s request`}
          />
        </label>
      </div>

      <div className="pre-approval-form-actions">
        <p className="muted-line">
          Recommendation support is advisory only. Final approval still belongs to the human reviewer.
        </p>
        <button
          type="button"
          className="pre-approval-submit"
          disabled={isSubmitting}
          onClick={onSubmit}
        >
          {isSubmitting ? "Evaluating..." : "Evaluate request"}
        </button>
      </div>
    </section>
  );
}
