import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type {
	AccessMember,
	AccessMembers,
	AccessRole,
} from "../../../../shared/contracts";
import { ApiError, api } from "../../../shared/api";
import {
	Alert,
	AlertDialog,
	Avatar,
	Button,
	Card,
	ErrorState,
	Form,
	LoadingState,
	QueryEmptyState,
	SelectField,
	TextInputField,
	TrashIcon,
	Typography,
	UserPlusIcon,
} from "../../../shared/ui";

const roleOptions = [
	{ value: "member", label: "구성원" },
	{ value: "admin", label: "관리자" },
	{ value: "owner", label: "소유자" },
];

function errorMessage(error: unknown): string {
	return error instanceof ApiError
		? error.message
		: "Access 역할을 변경하지 못했습니다.";
}

function MemberCard({
	member,
	isPending,
	onRoleChange,
	onRemove,
}: {
	member: AccessMember;
	isPending: boolean;
	onRoleChange: (role: AccessRole) => void;
	onRemove: () => void;
}) {
	return (
		<Card>
			<Card.Content className="gap-4 sm:flex-row sm:items-end">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<Avatar size="sm">
						<Avatar.Fallback>
							{member.email.slice(0, 1).toUpperCase()}
						</Avatar.Fallback>
					</Avatar>
					<div className="min-w-0">
						<Typography.Paragraph truncate weight="medium">
							{member.email}
						</Typography.Paragraph>
						<Typography.Paragraph color="muted" size="xs">
							{member.bootstrap
								? "초기 소유자 · 제거하거나 강등할 수 없음"
								: "Cloudflare Access 구성원"}
						</Typography.Paragraph>
					</div>
				</div>
				<SelectField
					className="sm:w-40"
					label="역할"
					value={member.role}
					options={roleOptions}
					isDisabled={isPending || member.bootstrap}
					onValueChange={(value) => onRoleChange(value as AccessRole)}
				/>
				{member.bootstrap ? (
					<Button
						isIconOnly
						aria-label={`${member.email} 제거`}
						variant="ghost"
						isDisabled
					>
						<TrashIcon size={18} />
					</Button>
				) : (
					<AlertDialog>
						<Button
							isIconOnly
							aria-label={`${member.email} 제거`}
							variant="ghost"
							isDisabled={isPending}
						>
							<TrashIcon size={18} />
						</Button>
						<AlertDialog.Backdrop>
							<AlertDialog.Container>
								<AlertDialog.Dialog>
									<AlertDialog.Header>
										<AlertDialog.Heading>
											구성원을 제거할까요?
										</AlertDialog.Heading>
									</AlertDialog.Header>
									<AlertDialog.Body>
										<Typography.Paragraph color="muted">
											{member.email}의 이 프로젝트 역할이 제거되고, Cloudflare
											계정의 기존 Access 세션도 취소됩니다.
										</Typography.Paragraph>
									</AlertDialog.Body>
									<AlertDialog.Footer>
										<Button slot="close" variant="secondary">
											취소
										</Button>
										<Button
											slot="close"
											variant="danger"
											isPending={isPending}
											onPress={onRemove}
										>
											제거
										</Button>
									</AlertDialog.Footer>
								</AlertDialog.Dialog>
							</AlertDialog.Container>
						</AlertDialog.Backdrop>
					</AlertDialog>
				)}
			</Card.Content>
		</Card>
	);
}

export function AccessMemberManager() {
	const queryClient = useQueryClient();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<AccessRole>("member");
	const members = useQuery({
		queryKey: ["access-members"],
		queryFn: api.accessMembers.list,
		retry: false,
	});
	const mutation = useMutation({
		mutationFn: (
			input:
				| { kind: "set"; email: string; role: AccessRole }
				| { kind: "remove"; email: string },
		) =>
			input.kind === "set"
				? api.accessMembers.setRole(input.email, { role: input.role })
				: api.accessMembers.remove(input.email),
		onSuccess: (data: AccessMembers) => {
			queryClient.setQueryData(["access-members"], data);
			setEmail("");
			setRole("member");
		},
	});

	if (members.isLoading) {
		return <LoadingState label="Access 구성원을 불러오는 중" />;
	}
	if (members.isError || !members.data) {
		return <ErrorState message={errorMessage(members.error)} />;
	}

	return (
		<div className="grid gap-6">
			<Card>
				<Card.Header>
					<Card.Title>구성원 추가</Card.Title>
					<Card.Description>
						이메일과 고정 역할을 선택합니다. 운영에서는 Cloudflare Access 정책에
						즉시 반영됩니다.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<Form
						className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end"
						onSubmit={(event) => {
							event.preventDefault();
							const normalizedEmail = email.trim().toLowerCase();
							if (!normalizedEmail) return;
							mutation.mutate({
								kind: "set",
								email: normalizedEmail,
								role,
							});
						}}
					>
						<TextInputField
							label="이메일"
							type="email"
							value={email}
							onValueChange={setEmail}
							required
							isDisabled={mutation.isPending}
							placeholder="teammate@example.com"
						/>
						<SelectField
							label="역할"
							value={role}
							options={roleOptions}
							onValueChange={(value) => setRole(value as AccessRole)}
							isDisabled={mutation.isPending}
						/>
						<Button
							type="submit"
							variant="primary"
							isPending={mutation.isPending}
						>
							<UserPlusIcon size={18} />
							추가
						</Button>
					</Form>
				</Card.Content>
			</Card>

			{mutation.isError && (
				<Alert status="danger">
					<Alert.Content>
						<Alert.Title>구성원 변경 실패</Alert.Title>
						<Alert.Description>
							{errorMessage(mutation.error)}
						</Alert.Description>
					</Alert.Content>
				</Alert>
			)}

			<section className="grid gap-3" aria-label="Access 구성원">
				{members.data.members.length === 0 ? (
					<QueryEmptyState
						title="구성원이 없습니다"
						description="첫 구성원을 추가하세요."
					/>
				) : (
					members.data.members.map((member) => (
						<MemberCard
							key={member.email}
							member={member}
							isPending={mutation.isPending}
							onRoleChange={(nextRole) =>
								mutation.mutate({
									kind: "set",
									email: member.email,
									role: nextRole,
								})
							}
							onRemove={() =>
								mutation.mutate({
									kind: "remove",
									email: member.email,
								})
							}
						/>
					))
				)}
			</section>
		</div>
	);
}
